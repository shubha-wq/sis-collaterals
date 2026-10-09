import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { dateToken, exportFileName, safeToken } from "@/export/filename";
import { exportReadiness } from "@/export/gate";
import { createBlankProject } from "@/model/blank";
import type { EventContent, Project, TemplateId } from "@/model/project";
import type { ImageSlot, TemplateImages } from "@/templates/types";
import { reviewProject } from "@/validation/projectChecks";

/**
 * Export rules that don't need a browser: filenames and the download gate.
 * The rendering itself (exact size, square corners, fonts, real image) is
 * checked on real PNGs by the browser harness at /qa/export.
 */

const TODAY = new Date(2026, 9, 7); // 7 Oct 2026

function project(content: Partial<EventContent> = {}, template: TemplateId = "broadsheet", format: "feed" | "banner" = "feed"): Project {
  const p = createBlankProject("x", TODAY, { template, format });
  return { ...p, content: { ...p.content, ...content } };
}

describe("export filename: SIS_[City]_[Date]_[Template]_Instagram-Creative.png", () => {
  it("uses every part when present", () => {
    expect(exportFileName(project({ city: "Bangalore", date: "12th October" }, "broadsheet"), TODAY)).toBe("SIS_Bangalore_12-Oct-2026_Broadsheet_Instagram-Creative.png");
    expect(exportFileName(project({ city: "Chennai", date: "3rd November" }, "poster"), TODAY)).toBe("SIS_Chennai_03-Nov-2026_Poster_Instagram-Creative.png");
  });

  it("leaves out a missing city or date (no placeholders)", () => {
    expect(exportFileName(project({ date: "12th October" }, "block"), TODAY)).toBe("SIS_12-Oct-2026_Block_Instagram-Creative.png");
    expect(exportFileName(project({ city: "Bangalore" }, "slab"), TODAY)).toBe("SIS_Bangalore_Slab_Instagram-Creative.png");
    expect(exportFileName(project({}, "ticket"), TODAY)).toBe("SIS_Ticket_Instagram-Creative.png");
  });

  it("covers all five templates", () => {
    for (const t of ["broadsheet", "poster", "block", "slab", "ticket"] as const) {
      expect(exportFileName(project({}, t), TODAY)).toMatch(/^SIS_(Broadsheet|Poster|Block|Slab|Ticket)_Instagram-Creative\.png$/);
    }
  });

  it("is safe on macOS and Windows", () => {
    const name = exportFileName(project({ city: 'Mumbai / Navi: "West" <Bandra>|?*', date: "12th October" }), TODAY);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name).toBe("SIS_Mumbai-Navi-West-Bandra_12-Oct-2026_Broadsheet_Instagram-Creative.png");
    expect(safeToken("Café & Co")).toBe("Cafe-and-Co");
    expect(safeToken("   ")).toBe("");
    expect(safeToken("a".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("date token", () => {
  it("reads day and month in common forms", () => {
    expect(dateToken("12th October", TODAY)).toBe("12-Oct-2026");
    expect(dateToken("Oct 12", TODAY)).toBe("12-Oct-2026");
    expect(dateToken("12 oct", TODAY)).toBe("12-Oct-2026");
    expect(dateToken("Saturday 1st November", TODAY)).toBe("01-Nov-2026");
  });
  it("uses a typed year, otherwise the next time the date comes round", () => {
    expect(dateToken("12th October 2027", TODAY)).toBe("12-Oct-2027");
    expect(dateToken("7th October", TODAY)).toBe("07-Oct-2026");
    expect(dateToken("5th October", TODAY)).toBe("05-Oct-2027");
    expect(dateToken("10th January", TODAY)).toBe("10-Jan-2027");
  });
  it("falls back to a clean version of text it can't read; empty stays empty", () => {
    expect(dateToken("Every Sunday", TODAY)).toBe("Every-Sunday");
    expect(dateToken("", TODAY)).toBe("");
  });
});

describe("download gate", () => {
  const ready = (url = "/x.png", tone?: "dark"): ImageSlot => ({ state: "ready", image: { url, width: 1600, height: 1066, tone } });
  const imgs = (p: Project, photo: ImageSlot, partners: ImageSlot[] = []): TemplateImages => ({ photo, sis: SIS_DRAWABLE, partners: partners.map((slot, i) => ({ id: p.logos.partners[i]?.id ?? `p${i}`, slot })) });
  const FULL = { headline: "Run", date: "1st May", time: "7 AM", venue: "Park", city: "Bangalore" };

  it("allows a complete creative", () => {
    const p = project(FULL);
    expect(exportReadiness(reviewProject(p, imgs(p, ready()), { status: "fits", step: 0 }), imgs(p, ready())).ok).toBe(true);
  });

  it("allows a no-photo creative and creatives with missing optional fields (warnings only)", () => {
    const p = project({ headline: "Run" });
    const i = imgs(p, { state: "empty" });
    const issues = reviewProject(p, i, { status: "fits", step: 0 });
    expect(issues.some((x) => x.level === "warning")).toBe(true);
    expect(exportReadiness(issues, i).ok).toBe(true);
  });

  it("allows download despite the logo legibility warning (advisory only)", () => {
    const base = project(FULL, "poster");
    const p: Project = { ...base, logos: { background: "none", partners: [{ id: "p0", source: { kind: "builtin", id: "nike" } }] } };
    const i = imgs(p, { state: "empty" }, [ready("/nike.png", "dark")]);
    const issues = reviewProject(p, i, { status: "fits", step: 0 });
    expect(issues.some((x) => x.id === "logo-contrast-p0")).toBe(true);
    expect(exportReadiness(issues, i).ok).toBe(true);
  });

  it("blocks when the content cannot fit, with a readable reason", () => {
    const p = project(FULL);
    const r = exportReadiness(reviewProject(p, imgs(p, ready()), { status: "cannot-fit", step: 10 }), imgs(p, ready()));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/more text than fits/);
  });

  it("blocks without a headline, with a missing file, or while images load", () => {
    const blank = project({});
    expect(exportReadiness(reviewProject(blank, imgs(blank, ready()), null), imgs(blank, ready())).ok).toBe(false);
    const p = project(FULL);
    expect(exportReadiness(reviewProject(p, imgs(p, { state: "missing", name: "x" }), null), imgs(p, { state: "missing", name: "x" })).ok).toBe(false);
    const loading = exportReadiness([], imgs(p, { state: "loading" }));
    expect(loading.ok).toBe(false);
    expect(loading.reasons[0]).toMatch(/still loading/);
  });
});
