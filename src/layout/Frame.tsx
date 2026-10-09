import { useContext, type CSSProperties, type ReactNode, type Ref } from "react";
import { ParentDirection, len, space, useCanvas } from "./canvas";
import type { Align, Distribute, FrameProps, Padding, Sizing } from "./types";

const ALIGN: Record<Align, CSSProperties["alignItems"]> = {
  start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline",
};
const DISTRIBUTE: Record<Distribute, CSSProperties["justifyContent"]> = {
  start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between",
};

function paddingCss(p: Padding | undefined, u: number, fixed: boolean): CSSProperties {
  if (p === undefined) return {};
  const s = (v: number | undefined) => (v === undefined ? undefined : space(v, u, fixed));
  if (typeof p === "number") return { padding: s(p) };
  return {
    paddingTop: s(p.top ?? p.y),
    paddingBottom: s(p.bottom ?? p.y),
    paddingLeft: s(p.left ?? p.x),
    paddingRight: s(p.right ?? p.x),
  };
}

/** Sizing on the parent's main axis becomes flex; on the cross axis, align-self / size. */
function sizingCss(s: Sizing | undefined, axis: "width" | "height", parentMain: "width" | "height" | null, u: number): CSSProperties {
  if (s === undefined) return {};
  const onMain = parentMain === axis;
  if (s === "hug") return onMain ? { flex: "0 0 auto" } : { [axis]: "auto", alignSelf: parentMain ? "flex-start" : undefined };
  if (s === "fill" || "fill" in s) {
    const w = s === "fill" ? 1 : s.fill;
    return onMain ? { flex: `${w} 1 0`, [axis === "width" ? "minWidth" : "minHeight"]: 0 } : { alignSelf: "stretch", [axis]: parentMain ? undefined : "100%" };
  }
  const px = `${Math.round(s.fixed * u)}px`;
  return onMain ? { flex: `0 0 ${px}` } : { [axis]: px };
}

export interface FrameComponentProps extends FrameProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** For anchoring an overlay Layer inside this frame. */
  relative?: boolean;
  ref?: Ref<HTMLDivElement>;
  "data-slot"?: string;
  [data: `data-${string}`]: string | undefined;
}

/**
 * The auto-layout box. Children flow in `direction` with `gap`; the frame
 * hugs, fills or is fixed along each axis of its parent; min/max constrain
 * it. Content always drives size unless a constraint says otherwise.
 */
export function Frame({
  direction = "column", width, height, minWidth, maxWidth, minHeight, maxHeight,
  padding, gap, rowGap, align, distribute, wrap, fixedSpacing = false,
  children, className, style, relative, ref, ...rest
}: FrameComponentProps) {
  const { u } = useCanvas();
  const parent = useContext(ParentDirection);
  const parentMain = parent === "row" ? "width" : parent === "column" ? "height" : null;
  const css: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    flexWrap: wrap ? "wrap" : "nowrap",
    alignItems: align ? ALIGN[align] : undefined,
    justifyContent: distribute ? DISTRIBUTE[distribute] : undefined,
    // Longhands only: mixing the `gap` shorthand with `rowGap` makes React
    // clear one when the other changes.
    rowGap: (rowGap ?? gap) !== undefined ? space((rowGap ?? gap)!, u, fixedSpacing) : undefined,
    columnGap: gap !== undefined ? space(gap, u, fixedSpacing) : undefined,
    minWidth: len(minWidth, u) ?? 0,
    maxWidth: len(maxWidth, u),
    minHeight: len(minHeight, u),
    maxHeight: len(maxHeight, u),
    position: relative ? "relative" : undefined,
    boxSizing: "border-box",
    ...paddingCss(padding, u, fixedSpacing),
    ...sizingCss(width, "width", parentMain, u),
    ...sizingCss(height, "height", parentMain, u),
    ...style,
  };
  // Drop undefined keys: React clears a longhand set to undefined, which can
  // wipe what a shorthand just set (e.g. rowGap undefined after a var() gap).
  for (const k of Object.keys(css) as (keyof CSSProperties)[]) if (css[k] === undefined) delete css[k];
  return (
    <ParentDirection.Provider value={direction}>
      <div ref={ref} className={className} style={css} {...rest}>
        {children}
      </div>
    </ParentDirection.Provider>
  );
}

/**
 * An overlapping layer, pinned inside a `relative` Frame (e.g. tags and
 * logos over the photo). Its own content still uses auto layout.
 */
export function Layer({ children, inset, className, style }: { children: ReactNode; inset: number; className?: string; style?: CSSProperties }) {
  const { u } = useCanvas();
  return (
    <ParentDirection.Provider value={null}>
      <div className={className} data-layer="overlay" style={{ position: "absolute", inset: space(inset, u), display: "flex", flexDirection: "column", pointerEvents: "none", ...style }}>
        {children}
      </div>
    </ParentDirection.Provider>
  );
}
