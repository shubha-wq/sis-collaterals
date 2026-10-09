import type { CSSProperties } from "react";
import { color, cssVar } from "../tokens";

interface WordmarkProps {
  size?: number;
  tone?: "ink" | "inverse";
  style?: CSSProperties;
}

/** "Sisters in Sweat" lockup, rebuilt from the design-system Wordmark. */
export function Wordmark({ size = 20, tone = "ink", style }: WordmarkProps) {
  return (
    <span
      style={{
        fontFamily: cssVar("font-display"),
        fontWeight: cssVar("fw-black"),
        fontSize: size,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        color: tone === "inverse" ? color("off-white") : color("ink"),
        display: "inline-flex",
        gap: "0.28em",
        alignItems: "baseline",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span>Sisters</span>
      <span style={{ fontFamily: cssVar("font-body"), fontWeight: cssVar("fw-medium"), fontSize: "0.62em", color: color("coral"), letterSpacing: 0 }}>
        in
      </span>
      <span>Sweat</span>
    </span>
  );
}
