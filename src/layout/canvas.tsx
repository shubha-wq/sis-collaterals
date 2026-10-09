import { createContext, useContext } from "react";
import type { Direction, Length } from "./types";

/**
 * Canvas units. Every template is designed on a 1080-wide grid; `u` is how
 * many CSS pixels one unit is on the current format (1 on feed, ~1.0 on
 * banner). Templates render at real export size and the editor scales the
 * whole canvas with a CSS transform, so layout never depends on screen size.
 */
export function unitFor(width: number, height: number): number {
  return Math.min(width, height * 1.08) / 1080;
}

export interface CanvasContextValue {
  u: number;
  width: number;
  height: number;
}

export const CanvasContext = createContext<CanvasContextValue>({ u: 1, width: 1080, height: 1350 });

export function useCanvas(): CanvasContextValue {
  return useContext(CanvasContext);
}

/** Direction of the enclosing Frame, so a child knows its main axis. */
export const ParentDirection = createContext<Direction | null>(null);

/** Units → CSS length. Percentages pass through. */
export function len(v: Length | undefined, u: number): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${round(v * u)}px` : v;
}

/** Spacing that tightens with the fit ladder (--sp, set by useAutoFit). */
export function space(v: number, u: number, fixed = false): string {
  return fixed ? `${round(v * u)}px` : `calc(${round(v * u)}px * var(--sp, 1))`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
