import { describe, expect, it } from "vitest";
import { createBlankProject } from "@/model/blank";
import { FORMATS } from "@/model/formats";
import { resolveRoute } from "@/routes";

describe("routes", () => {
  it("serves the editor at the root", () => {
    expect(resolveRoute("/", false)).toBe("editor");
  });
  it("serves /qa only when QA is enabled", () => {
    expect(resolveRoute("/qa", true)).toBe("qa");
    expect(resolveRoute("/qa/", true)).toBe("qa");
    expect(resolveRoute("/qa", false)).toBe("not-found");
  });
  it("reports unknown paths", () => {
    expect(resolveRoute("/nope", true)).toBe("not-found");
  });
});

describe("model", () => {
  it("a new project has transparent logos and Auto settings", () => {
    const p = createBlankProject("x", new Date("2026-10-06T00:00:00Z"));
    expect(p.logos.background).toBe("none");
    expect(p.overrides).toEqual({});
    expect(p.style.detailStyle).toBe("auto");
    expect(p.createdAt).toBe("2026-10-06T00:00:00.000Z");
  });
  it("has exactly the two agreed output sizes", () => {
    expect(FORMATS.feed).toMatchObject({ width: 1080, height: 1350 });
    expect(FORMATS.banner).toMatchObject({ width: 1600, height: 1000 });
  });
});
