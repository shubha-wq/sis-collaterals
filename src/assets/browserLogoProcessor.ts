import type { ImageMeta } from "@/model/assets";
import { LogoUploadError, type LogoProcessor, type ProcessedLogo } from "@/persistence/types";
import { MAX_LOGO_BYTES, cornersLookOpaque, detectLogoType, humanizeLogoName, parseSvgSize } from "./logoFiles";

const THUMB = 160;
/** Long side of the PNG rendered from a PDF's first page. */
const PDF_RENDER_PX = 2400;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoUploadError("unreadable", "That file couldn't be opened as an image."));
    img.src = url;
  }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 0)) as Promise<HTMLImageElement>;
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new LogoUploadError("unreadable", "Couldn't render that logo."))), "image/png"),
  );
}

function fit(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** Draws the image small, reads its four corners, and makes the picker thumbnail. */
async function inspect(img: HTMLImageElement, width: number, height: number): Promise<{ thumbnail: Blob; opaque: boolean }> {
  const [tw, th] = fit(width, height, THUMB);
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new LogoUploadError("unreadable", "This browser couldn't process the logo.");
  g.drawImage(img, 0, 0, tw, th);
  let opaque = false;
  try {
    const px = (x: number, y: number) => Array.from(g.getImageData(x, y, 1, 1).data) as [number, number, number, number];
    opaque = cornersLookOpaque([px(0, 0), px(tw - 1, 0), px(0, th - 1), px(tw - 1, th - 1)]);
  } catch {
    opaque = false;
  }
  return { thumbnail: await toPng(c), opaque };
}

/** Page 1 of a PDF → transparent PNG, trimmed to the artwork. */
async function pdfToPng(file: File): Promise<Blob> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(8, PDF_RENDER_PX / Math.max(base.width, base.height)) });
    const c = document.createElement("canvas");
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    await page.render({ canvas: c, canvasContext: g, viewport, background: "rgba(0,0,0,0)" }).promise;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3]! > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < x0) return toPng(c);
    const pad = 4;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(c.width - 1, x1 + pad);
    y1 = Math.min(c.height - 1, y1 + pad);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return toPng(out);
  } catch (e) {
    if (e instanceof LogoUploadError) throw e;
    throw new LogoUploadError("pdf-failed", "Couldn't read that PDF. Export the logo as an SVG or transparent PNG instead.");
  }
}

/** Browser implementation: canvas for inspection, pdf.js (bundled) for PDFs. */
export const browserLogoProcessor: LogoProcessor = {
  async process(file: File): Promise<ProcessedLogo> {
    const type = detectLogoType(file.name, file.type);
    if (!type) throw new LogoUploadError("unsupported-type", "Upload an SVG, PNG, JPEG, WebP, GIF or PDF logo.");
    if (file.size > MAX_LOGO_BYTES) throw new LogoUploadError("too-large", "That file is over 25 MB. Export a smaller PNG or an SVG.");

    const display = type === "pdf" ? await pdfToPng(file) : file;
    const img = await loadImage(display);
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (type === "svg") {
      // Some SVGs have no intrinsic size (Firefox reports 0); read it from the markup.
      const size = parseSvgSize(await file.text());
      if (size) ({ width, height } = size);
      if (!width || !height) [width, height] = [300, 150];
    }
    if (!width || !height) throw new LogoUploadError("unreadable", "That file couldn't be opened as an image.");

    const { thumbnail, opaque } = await inspect(img, width, height);
    const meta: ImageMeta = {
      fileType: type === "pdf" ? "png" : type,
      vector: type === "svg",
      width: Math.round(width),
      height: Math.round(height),
      bytes: display.size,
      looksOpaqueBackground: opaque,
    };
    return { name: humanizeLogoName(file.name), original: file, originalType: type, display, thumbnail, meta };
  },
};
