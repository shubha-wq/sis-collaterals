/**
 * Geometry of the Website Banner arc: a quarter ellipse centred on the
 * canvas's top-right corner (so it is anchored top-right and curves down to
 * the right edge). Its semi-axes are sized from the event info it must
 * hold, then kept between a bold minimum and a maximum that leaves the photo
 * visible. Pure, so it is unit-tested.
 */

export const ARC_LIMITS = {
  /** Never smaller than this share of the canvas: a bold shape, not a blob. */
  minW: 0.38,
  minH: 0.48,
  /** Never larger: beyond this the content can't fit and the fit ladder steps in. */
  maxW: 0.74,
  maxH: 0.94,
} as const;

export interface ArcSize {
  /** Horizontal and vertical semi-axes in canvas px. */
  a: number;
  b: number;
  fits: boolean;
}

/**
 * reachX: distance from the right edge to the content's far (left) edge;
 * reachY: distance from the top edge to the content's bottom. `pad` keeps
 * the curve clear of the content's outer corner.
 * The far corner is the only point that can leave the ellipse, so the arc
 * contains the content when that corner is inside. The unclamped size
 * (√2 × reach on each axis) is the smallest ellipse through that corner.
 */
export function arcFor(reachX: number, reachY: number, width: number, height: number, pad: number): ArcSize {
  const rx = reachX > 0 ? reachX + pad : 0;
  const ry = reachY > 0 ? reachY + pad : 0;
  const a = Math.max(ARC_LIMITS.minW * width, rx * Math.SQRT2);
  const need = rx > 0 ? ry / Math.sqrt(Math.max(1e-6, 1 - (rx / a) ** 2)) : ry;
  const b = Math.max(ARC_LIMITS.minH * height, need);
  return { a, b, fits: a <= ARC_LIMITS.maxW * width + 0.5 && b <= ARC_LIMITS.maxH * height + 0.5 };
}

/** True when a point (measured from the top-right corner) lies inside the arc. */
export function insideArc(fromRight: number, fromTop: number, arc: Pick<ArcSize, "a" | "b">): boolean {
  return (fromRight / arc.a) ** 2 + (fromTop / arc.b) ** 2 <= 1 + 1e-9;
}
