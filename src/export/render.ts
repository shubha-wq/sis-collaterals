import { domToBlob } from "modern-screenshot";

/** A readable reason the export didn't produce an image. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

/** One frame, or 50 ms if the tab is hidden (browsers pause animation frames there). */
const nextFrame = () =>
  new Promise<void>((r) => {
    const t = setTimeout(r, 50);
    requestAnimationFrame(() => {
      clearTimeout(t);
      r();
    });
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, sleep(ms)]);

/**
 * Waits until every image inside the node has loaded (up to 15 s), then
 * gives each a short chance to decode. Polling rather than load events, so
 * an image that finished loading before we looked can't leave us waiting,
 * and background tabs (where decode() can stall) still finish.
 */
export async function imagesReady(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  const deadline = performance.now() + 15_000;
  while (imgs.some((img) => !img.complete) && performance.now() < deadline) await sleep(50);
  const broken = imgs.find((img) => !img.complete || img.naturalWidth === 0);
  if (broken) throw new ExportError("An image on the creative couldn't be loaded. Re-add the photo or logo and try again.");
  await Promise.all(imgs.map((img) => withTimeout(img.decode().catch(() => undefined), 2000)));
}

/**
 * Renders a template root (laid out at exact export size, untransformed) to a
 * PNG. Fonts and images are embedded by the renderer from the app's own
 * files. The result is decoded and its size checked before it is returned.
 */
export async function renderPng(node: HTMLElement, width: number, height: number): Promise<Blob> {
  await document.fonts.ready;
  await imagesReady(node);
  (window as unknown as { __exportTrace?: string[] }).__exportTrace?.push(`images@${Math.round(performance.now())}`);
  await nextFrame();
  await nextFrame();
  if (node.offsetWidth !== width || node.offsetHeight !== height) {
    throw new ExportError(`The creative measured ${node.offsetWidth} × ${node.offsetHeight} instead of ${width} × ${height}.`);
  }
  (window as unknown as { __exportTrace?: string[] }).__exportTrace?.push(`frames@${Math.round(performance.now())}`);
  let blob: Blob | null;
  try {
    blob = await domToBlob(node, { width, height, scale: 1, type: "image/png" });
  } catch {
    throw new ExportError("The image couldn't be rendered. Try again; if it keeps failing, reload the page.");
  }
  if (!blob || blob.size === 0) throw new ExportError("The image came out empty. Try again.");
  const bitmap = await createImageBitmap(blob);
  const size = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  if (size.w !== width || size.h !== height) throw new ExportError(`The image came out ${size.w} × ${size.h} instead of ${width} × ${height}.`);
  return blob;
}

/** A real browser download of the blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
