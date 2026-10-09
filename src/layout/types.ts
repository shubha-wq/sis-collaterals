/**
 * Auto-layout contract (Figma Auto Layout equivalents). Templates are
 * composed from <Frame>; absolute positioning is reserved for genuinely
 * overlapping layers (text or logos over a photo).
 *
 * Every number is in canvas units: 1 unit = 1px on a 1080-wide feed post,
 * scaled for the banner. Spacing (padding, gap) also scales with the fit
 * ladder's spacing factor, so long content can tighten space before type.
 */

/** How a box sizes along one axis. */
export type Sizing =
  | "hug"
  | "fill"
  | { fill: number }
  | { fixed: number };

/** Units, or a percentage of the parent ("36%"). */
export type Length = number | `${number}%`;

export interface Constraints {
  min?: Length;
  max?: Length;
}

export type Direction = "row" | "column";
export type Align = "start" | "center" | "end" | "stretch" | "baseline";
export type Distribute = "start" | "center" | "end" | "space-between";

export type Padding = number | { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number };

export interface FrameProps {
  direction?: Direction;
  width?: Sizing;
  height?: Sizing;
  minWidth?: Length;
  maxWidth?: Length;
  minHeight?: Length;
  maxHeight?: Length;
  padding?: Padding;
  gap?: number;
  /** Gap between wrapped lines, when it should differ from `gap`. */
  rowGap?: number;
  align?: Align;
  distribute?: Distribute;
  wrap?: boolean;
  /** Spacing ignores the fit ladder (for things like logo rows that must not tighten). */
  fixedSpacing?: boolean;
}

/**
 * One rung of a template's fit ladder. Templates try rungs in order until
 * the composition fits. Rungs change spacing and the headline only; nothing
 * else ever shrinks.
 */
export interface FitStep {
  /** Multiplier on padding and gaps (1 = designed spacing). */
  spacing: number;
  /** Multiplier on the headline size (1 = preferred). */
  headline: number;
  /** Template-specific extras, applied as CSS custom properties on the canvas. */
  vars?: Record<string, string>;
}

export type FitStatus = "fits" | "tightened" | "cannot-fit";

export interface FitResult {
  status: FitStatus;
  step: number;
  /** Human-readable reason, when the content can't fit. */
  reason?: string;
}
