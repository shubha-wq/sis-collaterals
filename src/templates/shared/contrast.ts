import type { TextRole } from "@/model/project";

/**
 * Measures the contrast of every text block that has a chosen colour
 * against what is actually behind it on the rendered canvas: its own or an
 * ancestor's solid background, a decorative shape it sits on (the Banner
 * arc), or the canvas ground. Text over a photo (or a fade over a photo)
 * has no single ground, so it isn't judged. Advisory only.
 */
export interface ContrastReading {
  role: TextRole;
  ratio: number;
  /** Tone of the ground, for the suggestion (Paper on dark, Ink on light). */
  ground: "dark" | "light";
}

/** Below this, chosen text may be hard to read (WCAG large-text threshold). */
export const MIN_TEXT_CONTRAST = 3;

type RGBA = [number, number, number, number];

export function parseColor(css: string): RGBA | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  const h = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (h) return [0, 2, 4].map((i) => parseInt(h[1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
  return null;
}

export function luminanceRGB([r, g, b]: RGBA): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratioOf(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminanceRGB(a), luminanceRGB(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const within = (r: DOMRect, box: DOMRect) => {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom;
};
const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function groundOf(el: HTMLElement, root: HTMLElement): RGBA | null {
  for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
    const bg = parseColor(getComputedStyle(n).backgroundColor);
    if (bg && bg[3] >= 0.9) return bg;
    if (bg && bg[3] > 0.05) return null; // a translucent ground: no single colour to judge against
  }
  const r = el.getBoundingClientRect();
  for (const d of root.querySelectorAll<SVGElement | HTMLElement>('[data-layer="decor"]')) {
    if (!within(r, d.getBoundingClientRect())) continue;
    const fill = d.querySelector("[fill]")?.getAttribute("fill") ?? getComputedStyle(d).backgroundColor;
    const c = fill ? parseColor(fill) : null;
    if (c) return c;
  }
  for (const layer of root.querySelectorAll<HTMLElement>('[data-layer="photo"], [data-layer="overlay"]')) {
    if (layer.querySelector("img") && overlaps(r, layer.getBoundingClientRect())) return null;
  }
  return parseColor(getComputedStyle(root).backgroundColor);
}

export function measureTextContrast(root: HTMLElement): ContrastReading[] {
  const out: ContrastReading[] = [];
  const seen = new Set<TextRole>();
  for (const el of root.querySelectorAll<HTMLElement>('[data-text-override="true"]')) {
    const role = el.dataset.textRole as TextRole;
    const fg = parseColor(getComputedStyle(el).color);
    const bg = groundOf(el, root);
    if (!fg || !bg) continue;
    const ratio = ratioOf(fg, bg);
    const reading: ContrastReading = { role, ratio: Math.round(ratio * 100) / 100, ground: luminanceRGB(bg) < 0.18 ? "dark" : "light" };
    // Report a role once, at its worst.
    const prev = out.findIndex((x) => x.role === role);
    if (prev >= 0) {
      if (reading.ratio < out[prev]!.ratio) out[prev] = reading;
    } else if (!seen.has(role)) out.push(reading);
    seen.add(role);
  }
  return out;
}

export function sameReadings(a: ContrastReading[], b: ContrastReading[]): boolean {
  return a.length === b.length && a.every((x, i) => x.role === b[i]!.role && x.ratio === b[i]!.ratio && x.ground === b[i]!.ground);
}
