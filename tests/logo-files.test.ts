import { describe, expect, it } from "vitest";
import { cornersLookOpaque, detectLogoType, humanizeLogoName, parseSvgSize } from "@/assets/logoFiles";
import { assessLogo } from "@/validation/logoChecks";
import type { ImageMeta } from "@/model/assets";

describe("detectLogoType", () => {
  it("reads MIME types", () => {
    expect(detectLogoType("a", "image/svg+xml")).toBe("svg");
    expect(detectLogoType("a", "image/png")).toBe("png");
    expect(detectLogoType("a", "image/jpeg")).toBe("jpeg");
    expect(detectLogoType("a", "image/webp")).toBe("webp");
    expect(detectLogoType("a", "application/pdf")).toBe("pdf");
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(detectLogoType("Logo.SVG", "")).toBe("svg");
    expect(detectLogoType("x.jpg", "application/octet-stream")).toBe("jpeg");
  });
  it("rejects anything else", () => {
    expect(detectLogoType("logo.ai", "application/postscript")).toBeNull();
    expect(detectLogoType("logo.heic", "image/heic")).toBeNull();
  });
});

describe("humanizeLogoName", () => {
  it.each([
    ["dame-health_logo-FINAL@2x.png", "Dame Health"],
    ["Aukera Logo Black.svg", "Aukera Black"],
    ["mille.png", "Mille"],
    ["NIKE_swoosh_v2 (1).png", "Nike Swoosh"],
    ["SIS-partner_MS.png", "SIS Partner MS"],
    ["HiveClubLogo.png", "Hive Club"],
    ["logo.png", "Logo"],
    ["1200x400.png", "Logo"],
  ])("%s → %s", (input, expected) => expect(humanizeLogoName(input)).toBe(expected));
});

describe("parseSvgSize", () => {
  it("uses width and height", () => expect(parseSvgSize('<svg width="200" height="50">')).toEqual({ width: 200, height: 50 }));
  it("uses the viewBox when there's no size", () => expect(parseSvgSize('<svg viewBox="0 0 400 100">')).toEqual({ width: 400, height: 100 }));
  it("keeps the viewBox ratio with one dimension", () => expect(parseSvgSize('<svg width="100" viewBox="0 0 400 100">')).toEqual({ width: 100, height: 25 }));
  it("ignores percentage sizes", () => expect(parseSvgSize('<svg width="100%" height="100%" viewBox="0 0 30 10">')).toEqual({ width: 30, height: 10 }));
  it("returns null when it can't tell", () => expect(parseSvgSize("<svg>")).toBeNull());
  it("returns null for non-SVG text", () => expect(parseSvgSize("hello")).toBeNull());
});

describe("cornersLookOpaque", () => {
  const white = [255, 255, 255, 255] as const;
  const clear = [0, 0, 0, 0] as const;
  it("flags a solid near-white background", () => expect(cornersLookOpaque([white, white, white, white])).toBe(true));
  it("passes a transparent logo", () => expect(cornersLookOpaque([clear, clear, clear, clear])).toBe(false));
  it("passes a logo with one transparent corner", () => expect(cornersLookOpaque([white, white, white, clear])).toBe(false));
  it("passes a dark solid background (not a 'white plate')", () => expect(cornersLookOpaque([[20, 20, 20, 255], [20, 20, 20, 255]])).toBe(false));
});

describe("assessLogo", () => {
  const meta = (m: Partial<ImageMeta>): ImageMeta => ({ fileType: "png", vector: false, width: 1200, height: 400, bytes: 1000, looksOpaqueBackground: false, ...m });
  it("is quiet for a good transparent logo", () => expect(assessLogo(meta({}), "X")).toEqual([]));
  it("warns about a baked-in background", () => expect(assessLogo(meta({ looksOpaqueBackground: true }), "X").map((i) => i.id)).toEqual(["logo-background"]));
  it("warns about a very small raster logo", () => expect(assessLogo(meta({ width: 120, height: 40 }), "X").map((i) => i.id)).toEqual(["logo-small"]));
  it("never warns that an SVG is small", () => expect(assessLogo(meta({ vector: true, fileType: "svg", width: 60, height: 20 }), "X")).toEqual([]));
  it("warns about extreme aspect ratios", () => {
    expect(assessLogo(meta({ width: 3000, height: 300 }), "X").map((i) => i.id)).toEqual(["logo-aspect"]);
    expect(assessLogo(meta({ width: 300, height: 3000 }), "X").map((i) => i.id)).toEqual(["logo-aspect"]);
  });
  it("never blocks export", () => {
    for (const i of assessLogo(meta({ looksOpaqueBackground: true, width: 50, height: 1000 }), "X")) expect(i.level).toBe("warning");
  });
});
