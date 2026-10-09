import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_ORDER, TEXT_COLOURS, logoPlateFill } from "@/design-system/brand";
import { CANVAS_RADIUS, COLORS, CREATIVE_RADIUS, RADIUS_SCALE, contrastRatio } from "@/design-system/tokens";

const DS = join(__dirname, "../src/design-system");
const read = (p: string) => readFileSync(join(DS, p), "utf8");
const allTokenCss = readdirSync(join(DS, "tokens")).map((f) => read("tokens/" + f)).join("\n");

function cssVars(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1]!, m[2]!.trim());
  return out;
}

describe("design tokens", () => {
  const vars = cssVars(allTokenCss);

  it("typed colours match the CSS colour tokens exactly", () => {
    const css = cssVars(read("tokens/colors.css"));
    for (const [name, hex] of Object.entries(COLORS)) expect(css.get(name)?.toUpperCase(), name).toBe(hex);
    expect(Object.keys(COLORS).sort()).toEqual([...css.keys()].sort());
  });

  it("every brand choice points at a defined colour token", () => {
    for (const a of Object.values(ACCENTS)) {
      for (const t of [a.token, a.on, a.tint]) expect(vars.has(t), t).toBe(true);
    }
    for (const t of Object.values(TEXT_COLOURS)) if (t.token) expect(vars.has(t.token), t.token).toBe(true);
  });

  it("every var() used in the token files is defined", () => {
    for (const m of allTokenCss.matchAll(/var\(--([a-z0-9-]+)\)/gi)) expect(vars.has(m[1]!), m[1]).toBe(true);
  });

  it("text on each accent clears 3:1 contrast (large display type)", () => {
    for (const id of ACCENT_ORDER) {
      const a = ACCENTS[id];
      expect(contrastRatio(COLORS[a.token], COLORS[a.on]), id).toBeGreaterThanOrEqual(3);
    }
  });

  it("logo plates: none means no plate at all", () => {
    expect(logoPlateFill("none", "coral")).toBeNull();
    expect(logoPlateFill("paper", "coral")).toBe("var(--paper)");
    expect(logoPlateFill("white", "teal")).toBe("var(--white)");
    expect(logoPlateFill("accent", "royal-blue")).toBe("var(--royal-blue)");
  });
});

describe("fonts", () => {
  const fontsCss = read("fonts.css");

  it("loads every face from local files that exist", () => {
    const urls = [...fontsCss.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(urls.length).toBe(8);
    for (const u of urls) {
      expect(u.startsWith("./fonts/")).toBe(true);
      expect(existsSync(join(DS, u)), u).toBe(true);
    }
  });

  it("covers the three SIS families", () => {
    for (const fam of ["Bricolage Grotesque", "Inter Tight", "Pacifico"]) expect(fontsCss).toContain(`font-family: "${fam}"`);
  });

  it("ships the OFL licence for each family", () => {
    for (const f of ["bricolagegrotesque", "intertight", "pacifico"]) expect(existsSync(join(DS, `fonts/OFL-${f}.txt`))).toBe(true);
  });

  it("makes no runtime request to Google Fonts or any CDN", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    for (const f of walk(join(__dirname, "../src")).filter((p) => /\.(css|tsx?|html)$/.test(p))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/fonts\.googleapis|fonts\.gstatic|unpkg\.com|cdnjs|jsdelivr/);
    }
  });
});

describe("radius system", () => {
  const SRC = join(__dirname, "../src");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const files = walk(SRC).filter((f) => /\.(css|tsx?)$/.test(f) && !f.includes("/design-system/tokens/"));

  it("has a restrained three-step scale (subtle < medium < large ≤ 12px), mirrored in CSS", () => {
    expect(RADIUS_SCALE.subtle).toBeLessThan(RADIUS_SCALE.medium);
    expect(RADIUS_SCALE.medium).toBeLessThan(RADIUS_SCALE.large);
    expect(RADIUS_SCALE.large).toBeLessThanOrEqual(12);
    const css = cssVars(read("tokens/radius.css"));
    for (const [k, v] of Object.entries(RADIUS_SCALE)) expect(css.get(`radius-${k}`), k).toBe(`${v}px`);
  });

  it("creative radii in canvas units match templates.css, and the canvas radius is 0", () => {
    const tpl = readFileSync(join(SRC, "templates/shared/templates.css"), "utf8");
    for (const [k, v] of Object.entries(CREATIVE_RADIUS)) expect(tpl).toContain(`--r-${k}: calc(var(--u) * ${v});`);
    expect(CANVAS_RADIUS).toBe(0);
    expect(tpl).toMatch(/\.tpl-canvas \{[^}]*border-radius: 0 !important;/);
  });

  it("every border-radius in the app uses the scale (or 0 / circle / inherit); no pills", () => {
    const allowed = /^(0|0px|50%|inherit|var\(--radius-(subtle|medium|large)\)|var\(--r-(subtle|medium|large)\)|"var\(--r-(subtle|medium|large)\)"|"50%"|"inherit"|plate \? "var\(--r-subtle\)" : 0)$/;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/border-radius:\s*([^;]+);/g)) expect(m[1]!.replace(" !important", "").trim(), `${f}: ${m[0]}`).toMatch(allowed);
      for (const m of text.matchAll(/borderRadius:\s*([^,}\n]+)/g)) expect(m[1]!.trim(), `${f}: ${m[0]}`).toMatch(allowed);
      expect(text, f).not.toMatch(/radius-pill|borderRadius:\s*999/);
    }
  });
});
