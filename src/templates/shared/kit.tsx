import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ACCENTS, TEXT_COLOURS, logoPlateFill, softOnAccent, type Accent } from "@/design-system/brand";
import { color, type ColorToken } from "@/design-system/tokens";
import { CanvasContext, unitFor } from "@/layout/canvas";
import { Frame } from "@/layout/Frame";
import { overflows, useAutoFit } from "@/layout/useAutoFit";
import type { FitResult, FitStep } from "@/layout/types";
import { FORMATS, type Format } from "@/model/formats";
import type { WebOutputId } from "@/model/outputs";
import type { Project, TemplateId } from "@/model/project";
import type { TemplateProps } from "../types";
import { detailItems, headlineLines, type DetailItem } from "./details";
import { LogoRow } from "./LogoRow";
import { makePaint, type TextPaint } from "./paint";
import { measureTextContrast } from "./contrast";
import { balanceTitle, isConnector } from "@/layout/titleBreaks";
import "./templates.css";

/**
 * Shared template kit. Every template is built from these pieces, so the
 * layout engine, fit rules and editor/export behaviour are identical; only
 * each template's composition differs.
 */

/** Headline never goes below 66% of its base size, in any template. */
export const HEADLINE_FLOOR = 0.66;
const HEADLINE_SCALE = { auto: 1, small: 0.86, large: 1.14 } as const;

export interface TemplateEnv {
  project: Project;
  images: TemplateProps["images"];
  mode: TemplateProps["mode"];
  format: Format;
  portrait: boolean;
  u: number;
  /** Page margin in canvas units. */
  m: number;
  /** No photo chosen: templates switch to their type-only composition. */
  typeOnly: boolean;
  accent: Accent;
  /** The person's Fine-tune text colour, or null for Auto. */
  textOverride: ColorToken | null;
  /** Text colour for type set directly on the accent. */
  onAccent: string;
  onAccentSoft: string;
  /** Logo plate fill, or null for none (the default). */
  plate: string | null;
  lines: string[];
  details: DetailItem[];
  subheader: string;
  notes: string;
  city: string;
  /** Multiplier from the headline-size override (Small / Auto / Large). */
  headlineOverride: number;
  /** Per-block text colours: paint.color(role, templateColour). */
  paint: TextPaint;
  onContrast?: TemplateProps["onContrast"];
}

export function useTemplateEnv({ project, images, mode, onContrast }: TemplateProps): TemplateEnv {
  const format = FORMATS[project.style.format];
  const portrait = format.height > format.width;
  const accent = ACCENTS[project.style.accent];
  const textOverride = TEXT_COLOURS[project.overrides.textColour ?? "auto"].token;
  const c = project.content;
  return {
    project,
    images,
    mode,
    format,
    portrait,
    u: unitFor(format.width, format.height),
    m: portrait ? 62 : 52,
    // A loading or missing photo keeps the photo layout (no flicker; missing stays visible).
    typeOnly: images.photo.state === "empty",
    accent,
    textOverride,
    onAccent: color(textOverride ?? accent.on),
    onAccentSoft: color(textOverride ?? softOnAccent(accent.id)),
    plate: logoPlateFill(project.logos.background, accent.id),
    lines: headlineLines(c.headline),
    details: detailItems(c),
    subheader: c.subheader.trim(),
    notes: c.notes.trim(),
    city: c.city.trim(),
    headlineOverride: HEADLINE_SCALE[project.overrides.headlineSize ?? "auto"],
    paint: makePaint(project),
    onContrast,
  };
}

/** Text colour for type on a non-accent ground: the override, or the given default. */
export function inkOr(env: TemplateEnv, fallback: ColorToken): string {
  return color(env.textOverride ?? fallback);
}

/**
 * Builds a fit ladder in the agreed priority: first the template's own
 * region changes (photo/panel share), then spacing (to 72%), then the
 * headline (down to the 66% floor).
 */
export function makeLadder(shareSteps: ReadonlyArray<Record<string, string>> = [{}]): FitStep[] {
  const last = shareSteps[shareSteps.length - 1] ?? {};
  const lh = (v: string, vars: Record<string, string>) => ({ ...vars, "--hlh": v });
  return [
    ...shareSteps.map((vars) => ({ spacing: 1, headline: 1, vars: lh("1", vars) })),
    { spacing: 0.86, headline: 1, vars: lh("1", last) },
    { spacing: 0.72, headline: 1, vars: lh("1", last) },
    ...[0.92, 0.84, 0.76].map((headline) => ({ spacing: 0.72, headline, vars: lh("1", last) })),
    // Last: tighten the title's leading a little as well, before reporting cannot-fit.
    ...[0.7, 0.66].map((headline) => ({ spacing: 0.72, headline, vars: lh(TITLE_TIGHT_LEADING, last) })),
  ];
}

/** A larger type-only headline can step further, but never below the absolute floor. */
export function makeTypeOnlyLadder(): FitStep[] {
  return [1, 0.86, 0.72]
    .map((spacing) => ({ spacing, headline: 1, vars: { "--hlh": "1" } }))
    .concat([0.9, 0.8, 0.7, 0.62, 0.55].map((headline) => ({ spacing: 0.72, headline, vars: { "--hlh": "1" } })))
    .concat([0.5, 0.45].map((headline) => ({ spacing: 0.72, headline, vars: { "--hlh": TITLE_TIGHT_LEADING } })));
}

/** Title leading on the last fit steps (× the normal 0.9). */
const TITLE_TIGHT_LEADING = "0.94";

interface TemplateCanvasProps {
  env: TemplateEnv;
  template: TemplateId | WebOutputId;
  ladder: readonly FitStep[];
  /** Template-specific problems, after the shared checks pass. */
  check?: (root: HTMLElement) => string | null;
  background: string;
  /** Headline size multiplier for this template/composition (on top of the override). */
  headlineScale?: number;
  onFit?: (r: FitResult) => void;
  children: ReactNode;
}

/**
 * After every layout (so after the fit loop), report the contrast of text
 * with a chosen colour. Editor only; the receiver ignores unchanged readings.
 */
function useContrastReport(rootRef: RefObject<HTMLDivElement | null>, onContrast: TemplateEnv["onContrast"]) {
  useLayoutEffect(() => {
    if (onContrast && rootRef.current) onContrast(measureTextContrast(rootRef.current));
  });
}

/**
 * The canvas root: exact export size, always square-cornered, canvas units,
 * and the auto-fit loop. Children compose the template with Frame.
 */
export function TemplateCanvas({ env, template, ladder, check, background, headlineScale = 1, onFit, children }: TemplateCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useAutoFit(rootRef, ladder, (root) => sharedFitCheck(root) ?? check?.(root) ?? null, [env.project, env.images, env.typeOnly], onFit, fitTitle);
  useContrastReport(rootRef, env.onContrast);
  const style = {
    width: env.format.width,
    height: env.format.height,
    background,
    "--u": `${env.u}px`,
    "--hs": String(env.headlineOverride * headlineScale * (env.portrait ? 1 : 0.94)),
  } as CSSProperties;
  return (
    <CanvasContext.Provider value={{ u: env.u, width: env.format.width, height: env.format.height }}>
      <div
        ref={rootRef}
        className="tpl-canvas"
        style={style}
        data-template={template}
        data-format={env.project.style.format}
        data-composition={env.typeOnly ? "type-only" : "photo"}
        data-fit={fit.status}
        data-fit-step={fit.step}
      >
        {children}
      </div>
    </CanvasContext.Provider>
  );
}

/** Headline font-size: base units × overrides × fit, clamped at the floor. */
export function headlineSize(env: TemplateEnv, base: number): string {
  const floor = base * HEADLINE_FLOOR * (env.portrait ? 1 : 0.94);
  return `calc(var(--u) * max(${floor}, ${base} * var(--hs) * var(--hword, 1) * var(--hfit, 1)))`;
}

/**
 * The event title's area: how tall it may grow (share of the canvas height)
 * and how many lines it may use. Past either, the fit ladder tightens
 * spacing, steps the title down and tightens its leading; then cannot-fit.
 * The title never takes space from the photo.
 */
export interface TitleArea {
  maxHeight: number;
  maxLines: number;
}

/** Defaults: photo compositions keep the title to about a third of the canvas; type-only may use more. */
export function defaultTitleArea(env: TemplateEnv): TitleArea {
  return env.typeOnly ? { maxHeight: 0.5, maxLines: 5 } : { maxHeight: 0.34, maxLines: 4 };
}

interface TitleProps {
  env: TemplateEnv;
  /** Base headline size in canvas units. */
  base: number;
  color: string;
  subColor?: string;
  align?: "left" | "center";
  gap?: number;
  area?: TitleArea;
}

/**
 * Subheader + event title + the editor-only ghost when empty. Each typed
 * line starts a new line; within a typed line, words are separate spans
 * with breakable gaps, so fitTitle can place balanced breaks explicitly.
 */
export function Title({ env, base, color: ink, subColor, align = "left", gap = 10, area }: TitleProps) {
  if (!env.subheader && env.lines.length === 0 && env.mode !== "editor") return null;
  const a = area ?? defaultTitleArea(env);
  const maxLines = Math.max(a.maxLines, env.lines.length);
  return (
    <Frame direction="column" gap={gap} data-slot="title" style={{ textAlign: align }}>
      {env.subheader && (
        <p className="tpl-eyebrow" data-slot="subheader" {...env.paint.attrs("subheader")} style={{ color: env.paint.color("subheader", subColor ?? ink) }}>
          {env.subheader}
        </p>
      )}
      {env.lines.length > 0 ? (
        <h1
          className="tpl-headline"
          data-slot="headline"
          data-title-max={Math.round(a.maxHeight * env.format.height)}
          data-max-lines={maxLines}
          {...env.paint.attrs("headline")}
          style={{ color: env.paint.color("headline", ink), fontSize: headlineSize(env, base) }}
        >
          {env.lines.map((l, i) => (
            <span key={i} className="tpl-headline-line">
              {l.split(/\s+/).filter(Boolean).map((w, j) => (
                <Fragment key={j}>
                  {j > 0 && (
                    <span className="tpl-gap" data-gap="true">
                      {" "}
                    </span>
                  )}
                  <span className="tpl-word" data-word="true">
                    {w}
                  </span>
                </Fragment>
              ))}
            </span>
          ))}
        </h1>
      ) : (
        env.mode === "editor" && (
          <div className="tpl-ghost" data-hint="true" style={{ color: ink }}>
            Event title
          </div>
        )
      )}
    </Frame>
  );
}

/** City label as a small tag with a soft corner. */
export function CityTag({ env, bg, fg, size = 21 }: { env: TemplateEnv; bg: string; fg: string; size?: number }) {
  if (!env.city) return null;
  return (
    <div
      className="tpl-tag"
      data-slot="city"
      {...env.paint.attrs("city")}
      style={{ flex: "0 1 auto", background: bg, color: env.paint.color("city", fg), fontSize: `calc(var(--u) * ${size})`, padding: "calc(var(--u) * 12) calc(var(--u) * 22)", borderRadius: "var(--r-subtle)" }}
    >
      {env.city}
    </div>
  );
}

/** Logos alone (SIS always last), sized optically; plates only if chosen. */
export function Logos({ env, base, align = "end" }: { env: TemplateEnv; base?: number; align?: "start" | "end" }) {
  return (
    <LogoRow
      sis={env.images.sis}
      partners={env.images.partners}
      plate={env.plate}
      background={env.project.logos.background}
      base={base ?? (env.portrait ? 110 : 100)}
      scale={env.project.overrides.logoScale ?? 1}
      align={align}
    />
  );
}

/** City tag left, logos right, wrapping when they meet. */
export function TopBar({ env, left, logoBase }: { env: TemplateEnv; left: ReactNode; logoBase?: number }) {
  return (
    <Frame direction="row" wrap distribute="space-between" align="start" gap={20} fixedSpacing data-slot="top-bar">
      {left ?? <span />}
      <Logos env={env} base={logoBase} />
    </Frame>
  );
}

/** Editor-only "+ Add a photo" pill, pinned inside an open region; never affects layout. */
export function AddPhotoHint({ env, ink }: { env: TemplateEnv; ink: string }) {
  if (env.mode !== "editor") return null;
  return (
    <div data-hint="true" data-layer="hint" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
      <span
        style={{
          color: ink,
          opacity: 0.45,
          border: "calc(var(--u) * 2) dashed currentColor",
          borderRadius: "var(--r-medium)",
          padding: "calc(var(--u) * 10) calc(var(--u) * 22)",
          fontFamily: "var(--font-body)",
          fontWeight: "var(--fw-semibold)",
          fontSize: "calc(var(--u) * 20)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        + Add a photo
      </span>
    </div>
  );
}

/**
 * Checks every template shares: no word wider than its column, no text
 * overflowing its box, and nothing outgrowing a box marked data-fit-box
 * (fixed-size regions and the canvas frame).
 */
export function sharedFitCheck(root: HTMLElement): string | null {
  const head = root.querySelector<HTMLElement>('[data-slot="headline"]');
  if (head && head.dataset.break !== "true" && head.scrollWidth > head.clientWidth + 1) return "headline-word";
  // The title stays inside its area: no taller than allowed, no more lines than allowed.
  if (head?.dataset.titleMax && head.offsetHeight > Number(head.dataset.titleMax) + 1) return "title-too-tall";
  if (head?.dataset.maxLines && Number(head.dataset.titleLines ?? 0) > Number(head.dataset.maxLines)) return "title-too-many-lines";
  for (const el of root.querySelectorAll('[data-detail], [data-slot="notes"], [data-slot="subheader"], [data-slot="city"]')) {
    if (overflows(el)) return "text-overflow";
  }
  for (const box of root.querySelectorAll<HTMLElement>("[data-fit-box]")) {
    if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) return "content-too-tall";
  }
  return null;
}

/** An overlay bar (tags, logos) must stay within its region, clear of the bottom 5%. */
export function overlayWithin(root: HTMLElement, barSelector: string, regionSelector: string): string | null {
  const bar = root.querySelector<HTMLElement>(barSelector);
  const region = root.querySelector<HTMLElement>(regionSelector);
  if (!bar || !region) return null;
  const b = bar.getBoundingClientRect();
  const r = region.getBoundingClientRect();
  return b.bottom > r.bottom - r.height * 0.05 ? "overlay-outgrows-region" : null;
}

/** Shrink allowed (× the title's size) to keep each typed line on one line before wrapping. */
export const ONE_LINE_MIN = 0.74;
/** Shrink allowed (× the wrapped size) to save one line when wrapping. */
export const FEWER_LINES_MIN = 0.85;

/**
 * Event title fitting, run on every rung of the fit ladder (so it adapts
 * when the ladder widens a column or steps the title down):
 *  1. Each typed line on one line at full size, if it fits.
 *  2. Otherwise shrink (down to ONE_LINE_MIN) to keep it on one line.
 *  3. Otherwise wrap, with balanced explicit breaks (see layout/titleBreaks):
 *     fewest lines, even line lengths, no connector left at a line end.
 *     If that needs more lines than the title area allows, size down.
 * Only a single word too long for the column even at the floor may break.
 * Measures real rendered text (Bricolage's optical size makes width
 * non-linear), in layout px, so the scaled editor and the export agree.
 * Records what it did on the title element (data-title-fit / -lines).
 */
export function fitTitle(root: HTMLElement) {
  root.style.setProperty("--hword", "1");
  const head = root.querySelector<HTMLElement>('[data-slot="headline"]');
  if (!head) return;
  head.removeAttribute("data-break");
  const gaps = [...head.querySelectorAll<HTMLElement>("[data-gap]")];
  const setBreak = (g: HTMLElement, on: boolean) => {
    if (on) {
      g.style.display = "block";
      g.style.height = "0";
      g.style.overflow = "hidden";
    } else {
      g.style.removeProperty("display");
      g.style.removeProperty("height");
      g.style.removeProperty("overflow");
    }
  };
  gaps.forEach((g) => setBreak(g, false));
  const W = head.clientWidth;
  if (W <= 0) return;
  const typed = [...head.querySelectorAll<HTMLElement>(".tpl-headline-line")];
  const maxLines = Number(head.dataset.maxLines) || 4;
  const fontPx = () => parseFloat(getComputedStyle(head).fontSize);
  const setK = (k: number) => root.style.setProperty("--hword", String(k));
  const widestTyped = () =>
    Math.max(
      0,
      ...typed.map((l) => {
        l.style.whiteSpace = "nowrap";
        l.style.width = "max-content";
        const w = l.offsetWidth;
        l.style.whiteSpace = "";
        l.style.width = "";
        return w;
      }),
    );

  // 1–2. One line per typed line, shrinking a little if needed.
  let k = 1;
  head.dataset.basePx = String(fontPx());
  const natural = widestTyped();
  head.dataset.oneLineK = String(Math.round((W / Math.max(natural, 1)) * 1000) / 1000);
  if (natural <= W) {
    head.dataset.titleFit = "one-line";
    head.dataset.titleLines = String(typed.length);
    return;
  }
  for (let i = 0; i < 6; i++) {
    const w = widestTyped();
    if (w <= W) {
      head.dataset.titleFit = "one-line-shrunk";
      head.dataset.titleLines = String(typed.length);
      return;
    }
    const next = Math.floor(k * (W / w) * 0.995 * 1000) / 1000;
    if (next < ONE_LINE_MIN) break;
    const before = fontPx();
    setK(next);
    if (fontPx() >= before - 0.01) break; // at the floor: can't shrink further
    k = next;
  }

  // 3. Wrap with balanced breaks, at full size unless the lines or a word need less.
  k = 1;
  setK(1);
  // Fractional widths in layout px (the editor canvas is CSS-scaled), with a
  // small margin so rounding can never push a computed line past the column.
  const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
  const widthOf = (el: HTMLElement) => el.getBoundingClientRect().width / scale;
  const measure = () => {
    const lines = typed.map((l) => {
      const words = [...l.querySelectorAll<HTMLElement>("[data-word]")];
      return { words: words.map(widthOf), connectors: words.map((w) => isConnector(w.textContent ?? "")) };
    });
    const gap = gaps[0] ? widthOf(gaps[0]) : 0;
    return balanceTitle(lines, gap, W - 2);
  };
  let result = measure();
  for (let i = 0; i < 24; i++) {
    if (result && result.lines <= maxLines) break;
    const before = fontPx();
    k = Math.floor(k * 0.95 * 1000) / 1000;
    setK(k);
    if (fontPx() >= before - 0.01) break; // reached the floor
    result = measure();
  }
  // A wrapped title takes a modest size step (down to FEWER_LINES_MIN) if
  // that saves a line (two even lines read better than three at full size),
  // or lets a connector move off a line end ("Strength &" / "Conditioning").
  if (result && result.lines > typed.length) {
    const start = k;
    const better = (r: NonNullable<typeof result>) => r.lines < result!.lines || (r.lines === result!.lines && r.dangling < result!.dangling);
    for (let kk = start - 0.03; kk >= start * FEWER_LINES_MIN - 0.001; kk -= 0.03) {
      if (result.dangling === 0 && result.lines <= typed.length) break;
      const before = fontPx();
      setK(Math.round(kk * 1000) / 1000);
      if (fontPx() >= before - 0.01) break;
      const r = measure();
      if (r && better(r)) {
        k = kk;
        result = r;
        if (r.dangling === 0) break;
      }
    }
    setK(Math.round(k * 1000) / 1000);
  }
  if (!result) {
    // A single word is wider than the column even at the floor: let it break.
    head.setAttribute("data-break", "true");
    head.dataset.titleFit = "word-break";
    head.dataset.titleLines = String(Math.round(head.offsetHeight / (parseFloat(getComputedStyle(head).lineHeight) || fontPx())));
    return;
  }
  typed.forEach((l, li) => {
    const lineGaps = [...l.querySelectorAll<HTMLElement>("[data-gap]")];
    // Gap j sits before word j + 1.
    for (const b of result!.breaks[li]!) setBreak(lineGaps[b - 1]!, true);
  });
  head.dataset.titleFit = "wrapped";
  head.dataset.titleLines = String(result.lines);
}
