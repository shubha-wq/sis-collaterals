import type { Rect, WebPhotoPlan } from "@/layout/webPhotoPlan";

/**
 * Safe background extension for "Whole photo" framing, entirely in the
 * browser (no AI service). Only the photo's outermost edge is read: a thin
 * strip (EDGE_SHARE of the photo) along each side that borders free space.
 * Each strip is averaged down to a short line of colours and spread across
 * the free space as a smooth gradient field, which eases towards the strip's
 * overall average colour and deepens slightly towards the canvas edge. Because only an averaged edge is used, a person or object
 * in the photo can never be copied, mirrored or reshaped; the photo itself is
 * drawn on top, untouched, by the template.
 *
 * Limitation: this is a colour-field extension, not generative outpainting.
 * It reads as soft continuous background, not as new scenery.
 */

/** Share of the photo's width (or height) read from each bordering edge. */
export const EDGE_SHARE = 0.03;
/** Number of colour samples along the edge: few, so the field stays soft. */
const SAMPLES = 12;

/** The source rectangles (in photo px) the extension reads from. Pure; used by tests. */
export function edgeStrips(srcW: number, srcH: number, plan: WebPhotoPlan): Array<{ gap: Rect; src: Rect; side: "left" | "right" | "top" | "bottom" }> {
  const out: Array<{ gap: Rect; src: Rect; side: "left" | "right" | "top" | "bottom" }> = [];
  const sw = Math.max(1, Math.round(srcW * EDGE_SHARE));
  const sh = Math.max(1, Math.round(srcH * EDGE_SHARE));
  for (const gap of plan.gaps) {
    if (plan.axis === "x") {
      const left = gap.x + gap.w <= plan.photo.x + 0.5;
      out.push({ gap, side: left ? "left" : "right", src: left ? { x: 0, y: 0, w: sw, h: srcH } : { x: srcW - sw, y: 0, w: sw, h: srcH } });
    } else if (plan.axis === "y") {
      const top = gap.y + gap.h <= plan.photo.y + 0.5;
      out.push({ gap, side: top ? "top" : "bottom", src: top ? { x: 0, y: 0, w: srcW, h: sh } : { x: 0, y: srcH - sh, w: srcW, h: sh } });
    }
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo failed to load"));
    img.src = url;
  });
}

async function compose(url: string, srcW: number, srcH: number, plan: WebPhotoPlan, outW: number, outH: number): Promise<string> {
  const img = await loadImage(url);
  // Natural size may differ from the recorded one (e.g. SVG); scale the strips.
  const kx = (img.naturalWidth || srcW) / srcW;
  const ky = (img.naturalHeight || srcH) / srcH;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#110405";
  g.fillRect(0, 0, outW, outH);
  for (const { gap, src, side } of edgeStrips(srcW, srcH, plan)) {
    const along = side === "left" || side === "right";
    // 1. Average the strip down to one line of colours.
    const line = document.createElement("canvas");
    line.width = along ? 1 : SAMPLES;
    line.height = along ? SAMPLES : 1;
    const lg = line.getContext("2d")!;
    lg.imageSmoothingEnabled = true;
    lg.imageSmoothingQuality = "high";
    lg.drawImage(img, src.x * kx, src.y * ky, src.w * kx, src.h * ky, 0, 0, line.width, line.height);
    // 2. Spread it over the gap, aligned with the photo along the shared edge.
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    if (along) g.drawImage(line, 0, 0, 1, SAMPLES, gap.x, plan.photo.y, gap.w, plan.photo.h);
    else g.drawImage(line, 0, 0, SAMPLES, 1, plan.photo.x, gap.y, plan.photo.w, gap.h);
    // 3. Ease towards the edge's average colour away from the photo, so the
    //    field has no streaks, then deepen gently so the photo stays the focus.
    const [x0, y0, x1, y1] =
      side === "left" ? [gap.x + gap.w, 0, gap.x, 0] : side === "right" ? [gap.x, 0, gap.x + gap.w, 0] : side === "top" ? [0, gap.y + gap.h, 0, gap.y] : [0, gap.y, 0, gap.y + gap.h];
    const dot = document.createElement("canvas");
    dot.width = dot.height = 1;
    const dg = dot.getContext("2d", { willReadFrequently: true })!;
    dg.drawImage(line, 0, 0, 1, 1);
    const [mr, mg, mb] = dg.getImageData(0, 0, 1, 1).data;
    const even = g.createLinearGradient(x0, y0, x1, y1);
    even.addColorStop(0, `rgba(${mr},${mg},${mb},0)`);
    even.addColorStop(0.35, `rgba(${mr},${mg},${mb},0.45)`);
    even.addColorStop(1, `rgba(${mr},${mg},${mb},0.8)`);
    g.fillStyle = even;
    g.fillRect(gap.x, gap.y, gap.w, gap.h);
    const shade = g.createLinearGradient(x0, y0, x1, y1);
    shade.addColorStop(0, "rgba(17,4,5,0)");
    shade.addColorStop(1, "rgba(17,4,5,0.28)");
    g.fillStyle = shade;
    g.fillRect(gap.x, gap.y, gap.w, gap.h);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("extension could not be encoded");
  return URL.createObjectURL(blob);
}

const cache = new Map<string, Promise<string>>();
const MAX_CACHED = 12;

/** Extension image (blob: URL) for a plan, cached so the editor and the export share it. */
export function extensionFor(url: string, srcW: number, srcH: number, plan: WebPhotoPlan, outW: number, outH: number): Promise<string> {
  const r = (n: number) => Math.round(n);
  const key = [url, outW, outH, r(plan.photo.x), r(plan.photo.y), r(plan.photo.w), r(plan.photo.h)].join("|");
  let hit = cache.get(key);
  if (!hit) {
    hit = compose(url, srcW, srcH, plan, outW, outH);
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
    if (cache.size > MAX_CACHED) {
      const [oldKey, old] = cache.entries().next().value as [string, Promise<string>];
      cache.delete(oldKey);
      // Give anything still showing it time to move on before releasing it.
      void old.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30_000)).catch(() => undefined);
    }
  }
  return hit;
}
