/**
 * Typed view of the SIS design tokens. The CSS custom properties in
 * tokens/*.css are the source of truth for rendering; this file mirrors the
 * values code needs to reason about (contrast, canvas drawing, exports).
 * tests/design-system.test.ts fails if the two drift apart.
 *
 * Components use `cssVar(...)` / `color(...)` rather than literal values.
 */

export const COLORS = {
  coral: "#EF6033",
  teal: "#17BEBB",
  "golden-yellow": "#FFD33B",
  "coral-salmon": "#E28162",
  "royal-blue": "#1D4E9B",
  "near-black": "#110405",
  "off-white": "#FAF0E4",
  stone: "#8A8073",
  "coral-tint": "#FCE7DE",
  "teal-tint": "#DDF4F3",
  "yellow-tint": "#FEF3D5",
  "blue-tint": "#E5EAF4",
  "salmon-tint": "#F8E5DE",
  "coral-deep": "#D14C22",
  "coral-press": "#B23F1B",
  "teal-deep": "#12A0A0",
  "teal-press": "#0D8484",
  "yellow-deep": "#EDBB1F",
  "blue-deep": "#163C78",
  "salmon-deep": "#CE6B4C",
  paper: "#FAF0E4",
  "paper-warm": "#F4E8DA",
  "paper-edge": "#EADFD0",
  "stone-soft": "#B8AFA3",
  ink: "#110405",
  "ink-soft": "#3A2E2C",
  white: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof COLORS;

export const FONTS = {
  display: '"Bricolage Grotesque", "Inter Tight", system-ui, sans-serif',
  body: '"Inter Tight", system-ui, -apple-system, sans-serif',
  accent: '"Pacifico", cursive',
} as const;

export const FONT_WEIGHTS = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, black: 800 } as const;

/** Every face the app ships. Export waits on these before rendering a PNG. */
export const FONT_FACES = [
  { family: "Bricolage Grotesque", weights: [400, 800], style: "normal" },
  { family: "Inter Tight", weights: [300, 700], style: "normal" },
  { family: "Inter Tight", weights: [400, 400], style: "italic" },
  { family: "Pacifico", weights: [400, 400], style: "normal" },
] as const;

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96, 30: 120 } as const;

export const RADIUS = { none: 0, xs: 2, sm: 4, md: 8, lg: 16, pill: 999 } as const;

/** The SIS radius language for UI (px). Soft and restrained; never pills. */
export const RADIUS_SCALE = { subtle: 4, medium: 8, large: 12 } as const;

/**
 * The same language inside creatives, in canvas units (1 unit = 1px at 1080
 * wide), exposed on .tpl-canvas as --r-subtle / --r-medium / --r-large.
 * The exported canvas itself is always square: CANVAS_RADIUS is 0, always.
 */
export const CREATIVE_RADIUS = { subtle: 6, medium: 10, large: 16 } as const;
export const CANVAS_RADIUS = 0;
/**
 * Corner of a photo contained inside a creative (not touching the canvas
 * edge): the large step of the creative scale, softer than cards and tags
 * but still refined. Any photo corner on the canvas edge stays square.
 */
export const IMAGE_RADIUS: keyof typeof CREATIVE_RADIUS = "large";

/** `var(--name)` for any CSS custom property defined in the token files. */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

export function color(token: ColorToken): string {
  return cssVar(token);
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
