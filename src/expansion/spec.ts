import type { ImageSource } from "@/model/assets";

/**
 * Geometry of an AI background expansion ("outpainting") for the website
 * outputs. Pure.
 *
 * The photo is scaled (uniformly) to fill the output on one axis, exactly as
 * the website "whole photo" plan places it. The AI is asked for ONE wider
 * landscape: the photo in the middle with (output − photo) of new background
 * on each free side. Any 1600 × 1000 window of that landscape that contains
 * the photo is valid, so the Listing and the Banner, and every focus
 * position the person picks, are windows onto the same generated image. It
 * is generated once per source photo and size, never per output or per edit.
 */
export interface ExpansionSpec {
  axis: "x" | "y";
  /** The photo at its placed size (px). */
  photoW: number;
  photoH: number;
  /** The generated landscape: photo plus new background on both free sides. */
  masterW: number;
  masterH: number;
  /** Where the photo sits inside the landscape. */
  photoX: number;
  photoY: number;
  /** New background requested on each side, in px. */
  left: number;
  right: number;
  up: number;
  down: number;
  outW: number;
  outH: number;
}

/** Bump when the prompt or geometry changes, so older derivatives are regenerated. */
export const EXPANSION_VERSION = "v1";

/** Null when the photo already fills the output (no background to generate). */
export function expansionSpec(srcW: number, srcH: number, outW: number, outH: number): ExpansionSpec | null {
  const scale = Math.min(outW / srcW, outH / srcH);
  const photoW = Math.round(srcW * scale);
  const photoH = Math.round(srcH * scale);
  // The new background on each side is rounded up from the exact (fractional)
  // free space, so the landscape covers the frame at every focus position.
  if (outW - photoW > 1) {
    const free = Math.ceil(outW - srcW * scale);
    return { axis: "x", photoW, photoH, masterW: photoW + 2 * free, masterH: photoH, photoX: free, photoY: 0, left: free, right: free, up: 0, down: 0, outW, outH };
  }
  if (outH - photoH > 1) {
    const free = Math.ceil(outH - srcH * scale);
    return { axis: "y", photoW, photoH, masterW: photoW, masterH: photoH + 2 * free, photoX: 0, photoY: free, left: 0, right: 0, up: free, down: free, outW, outH };
  }
  return null;
}

/** Identifies a derivative: same source photo + same expansion = reuse. Text, logos, colours and focus are not part of it. */
export function expansionKey(source: ImageSource, spec: ExpansionSpec): string {
  const src = source.kind === "builtin" ? `b:${source.id}` : `u:${source.blobId}`;
  return [src, `${spec.photoW}x${spec.photoH}`, `${spec.masterW}x${spec.masterH}`, spec.axis, EXPANSION_VERSION].join("|");
}

/**
 * Where to draw the landscape so the photo inside it lands exactly on the
 * planned photo rectangle (in canvas px). The landscape always covers the
 * whole canvas for any planned position of the photo.
 */
export function landscapePlacement(spec: Pick<ExpansionSpec, "photoX" | "photoY" | "photoW" | "photoH" | "masterW" | "masterH">, photo: { x: number; y: number; w: number; h: number }) {
  // Uniform scale (never distorts); the larger ratio absorbs whole-pixel rounding so the canvas is always covered.
  const k = Math.max(photo.w / spec.photoW, photo.h / spec.photoH);
  const x = photo.x - spec.photoX * k - (spec.photoW * k - photo.w) / 2;
  const y = photo.y - spec.photoY * k - (spec.photoH * k - photo.h) / 2;
  return { x, y, w: spec.masterW * k, h: spec.masterH * k };
}
