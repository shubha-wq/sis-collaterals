import type { AccentId, LogoBackground, TextColour } from "@/model/project";
import { COLORS, color, contrastRatio, type ColorToken } from "./tokens";

/**
 * Brand choices offered to people, mapped onto tokens. Each accent carries
 * its own legible foreground; only royal blue is dark enough for off-white
 * type (mirrors the action pairings in tokens/semantic.css).
 */
export interface Accent {
  id: AccentId;
  label: string;
  token: ColorToken;
  /** Foreground for text set directly on the accent. */
  on: ColorToken;
  /** Pale wash of the accent, used by the Broadsheet "Tint" ground. */
  tint: ColorToken;
}

export const ACCENTS: Record<AccentId, Accent> = {
  coral: { id: "coral", label: "Coral", token: "coral", on: "ink", tint: "coral-tint" },
  teal: { id: "teal", label: "Teal", token: "teal", on: "ink", tint: "teal-tint" },
  "royal-blue": { id: "royal-blue", label: "Royal blue", token: "royal-blue", on: "off-white", tint: "blue-tint" },
  "golden-yellow": { id: "golden-yellow", label: "Golden yellow", token: "yellow-deep", on: "ink", tint: "yellow-tint" },
  salmon: { id: "salmon", label: "Salmon", token: "coral-salmon", on: "ink", tint: "salmon-tint" },
};

export const ACCENT_ORDER: readonly AccentId[] = ["coral", "teal", "royal-blue", "golden-yellow", "salmon"];

/** The approved text palette (Fine-tune "All text" and per-block Text colours). "auto" means the template picks. */
export const TEXT_COLOURS: Record<TextColour, { label: string; token: ColorToken | null }> = {
  auto: { label: "Auto", token: null },
  ink: { label: "Ink", token: "ink" },
  "off-white": { label: "Paper", token: "off-white" },
  coral: { label: "Coral", token: "coral" },
  teal: { label: "Teal", token: "teal" },
  "royal-blue": { label: "Royal blue", token: "royal-blue" },
  golden: { label: "Golden", token: "yellow-deep" },
};

/** Logo plate options. "none" is the default and means a fully transparent logo. */
export const LOGO_BACKGROUNDS: Record<LogoBackground, { label: string }> = {
  none: { label: "None" },
  paper: { label: "Paper" },
  white: { label: "White" },
  accent: { label: "Accent" },
};

/** CSS fill for a logo plate; null means no plate at all. */
export function logoPlateFill(background: LogoBackground, accent: AccentId): string | null {
  switch (background) {
    case "none":
      return null;
    case "paper":
      return color("paper");
    case "white":
      return color("white");
    case "accent":
      return color(ACCENTS[accent].token);
  }
}

export function accentHex(id: AccentId): string {
  return COLORS[ACCENTS[id].token];
}

/** Accent colour for small labels on paper, or ink-soft when the accent is too light to read there. */
export function labelOnPaper(id: AccentId): ColorToken {
  const token = ACCENTS[id].token;
  return contrastRatio(COLORS[token], COLORS.paper) >= 3 ? token : "ink-soft";
}

/** Softer text on the accent: body copy that shouldn't compete with the headline. */
export function softOnAccent(id: AccentId): ColorToken {
  return ACCENTS[id].on === "ink" ? "ink-soft" : "off-white";
}
