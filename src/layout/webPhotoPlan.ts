import type { WebFraming } from "@/model/outputs";

/**
 * How a photo is placed on a website output (1600 × 1000). Pure geometry,
 * no pixels. The photo is only ever scaled uniformly: the drawn rectangle
 * always has the photo's own aspect ratio, so nothing is stretched or
 * squashed, and no part of the photo is ever drawn twice.
 *
 *   crop: the photo covers the frame; the overflow is cropped, positioned so
 *         the focal point stays in frame (zoom enlarges around it).
 *   fit:  the whole photo is visible. The free space on two sides is filled
 *         with a soft extension made only from the photo's outermost edge
 *         (see composeExtension); the photo's own pixels are untouched.
 *
 * Auto crops only when the crop keeps at least KEEP_FOR_CROP of the photo,
 * so a subject near the edge of a square or portrait photo is never cut off.
 * There is no subject detection: the focal point and the Fill frame / Whole
 * photo choice are how a person overrides the rule.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WebPhotoPlan {
  mode: "crop" | "fit";
  /** Where the whole photo is drawn on the canvas, in canvas px. May extend past the edges when cropping. */
  photo: Rect;
  /** Areas of the canvas not covered by the photo (fit only): filled by the edge extension. */
  gaps: Rect[];
  /** Which sides the extension grows from. */
  axis: "x" | "y" | null;
  /** Share of the photo (by area) that stays visible, 0–1. */
  kept: number;
  /** Canvas px per photo px. Above 1 the photo is enlarged. */
  scale: number;
}

/** Auto crops only if at least this share of the photo stays visible. */
export const KEEP_FOR_CROP = 0.72;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Share of the photo a pure cover crop (no zoom) would keep. */
export function coverKeeps(srcW: number, srcH: number, outW: number, outH: number): number {
  const a = srcW / srcH;
  const b = outW / outH;
  return Math.min(a, b) / Math.max(a, b);
}

export function resolveFill(framing: Pick<WebFraming, "fill">, srcW: number, srcH: number, outW: number, outH: number): "crop" | "fit" {
  if (framing.fill !== "auto") return framing.fill;
  return coverKeeps(srcW, srcH, outW, outH) >= KEEP_FOR_CROP ? "crop" : "fit";
}

export function planWebPhoto(srcW: number, srcH: number, outW: number, outH: number, framing: WebFraming): WebPhotoPlan {
  const mode = resolveFill(framing, srcW, srcH, outW, outH);
  const fx = clamp(framing.focusX, 0, 100) / 100;
  const fy = clamp(framing.focusY, 0, 100) / 100;

  if (mode === "crop") {
    const scale = Math.max(outW / srcW, outH / srcH) * clamp(framing.zoom, 1, 2.5);
    const w = srcW * scale;
    const h = srcH * scale;
    // Put the focal point where it would sit proportionally, then keep the frame covered.
    const x = clamp(outW * fx - w * fx, outW - w, 0);
    const y = clamp(outH * fy - h * fy, outH - h, 0);
    return { mode, photo: { x, y, w, h }, gaps: [], axis: null, kept: (outW * outH) / (w * h), scale };
  }

  const scale = Math.min(outW / srcW, outH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  // Whole photo; the focal sliders move it within the free space.
  const x = (outW - w) * fx;
  const y = (outH - h) * fy;
  const gaps: Rect[] = [];
  const EPS = 0.5;
  const axis = outW - w > EPS ? "x" : outH - h > EPS ? "y" : null;
  if (axis === "x") {
    if (x > EPS) gaps.push({ x: 0, y: 0, w: x, h: outH });
    if (outW - (x + w) > EPS) gaps.push({ x: x + w, y: 0, w: outW - (x + w), h: outH });
  } else if (axis === "y") {
    if (y > EPS) gaps.push({ x: 0, y: 0, w: outW, h: y });
    if (outH - (y + h) > EPS) gaps.push({ x: 0, y: y + h, w: outW, h: outH - (y + h) });
  }
  return { mode, photo: { x, y, w, h }, gaps, axis, kept: 1, scale };
}
