import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_LOGOS, BUILTIN_PARTNER_LOGOS, BUILTIN_PHOTOS, SIS_LOGO_ID } from "@/assets/catalog";

const LIB = join(__dirname, "../src/assets/library");

describe("built-in logos", () => {
  it("has the SIS logo as the one required logo", () => {
    const sis = BUILTIN_LOGOS.filter((l) => l.role === "sis");
    expect(sis.map((l) => l.id)).toEqual([SIS_LOGO_ID]);
  });

  it("has Nike as the only built-in partner", () => {
    expect(BUILTIN_PARTNER_LOGOS.map((l) => l.id)).toEqual(["nike"]);
  });

  it("ships exactly the two logo files and no others (no Hive Club etc.)", () => {
    expect(readdirSync(join(LIB, "logos")).sort()).toEqual(["nike-swoosh-black.png", "sisters-in-sweat-roundel-coral.png"]);
  });

  it("logo PNGs keep their alpha channel (colour type 6 = RGBA)", () => {
    for (const f of readdirSync(join(LIB, "logos"))) {
      const png = readFileSync(join(LIB, "logos", f));
      expect(png.subarray(1, 4).toString(), f).toBe("PNG");
      expect(png[25], f).toBe(6);
    }
  });
});

describe("built-in photos", () => {
  it("has unique ids and one file per entry", () => {
    const ids = BUILTIN_PHOTOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const files = readdirSync(join(LIB, "photos")).map((f) => f.replace(/\.jpg$/, "")).sort();
    expect(files).toEqual([...ids].sort());
  });

  it("every photo has its own small picker thumbnail", () => {
    const thumbs = readdirSync(join(LIB, "photo-thumbs")).map((f) => f.replace(/\.jpg$/, "")).sort();
    expect(thumbs).toEqual(BUILTIN_PHOTOS.map((p) => p.id).sort());
    for (const p of BUILTIN_PHOTOS) expect(p.thumbUrl).not.toBe(p.url);
  });

  it("matches the original tool's 17-photo library", () => {
    expect(BUILTIN_PHOTOS).toHaveLength(17);
  });

  it("records real dimensions and sane focal points", () => {
    for (const p of BUILTIN_PHOTOS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.focusX).toBeGreaterThanOrEqual(0);
      expect(p.focusX).toBeLessThanOrEqual(100);
    }
  });
});

describe("no machine paths or reference files in the app", () => {
  it("source never points at local paths or docs/reference", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    for (const f of walk(join(__dirname, "../src")).filter((p) => /\.(css|tsx?)$/.test(p))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\/Users\/|\/private\/tmp|docs\/reference|uploads\//);
    }
  });
});
