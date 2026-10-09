import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { opticalLogoBox, logoRowScale } from "@/layout/logoSizing";
import { createBlankProject } from "@/model/blank";
import type { EventContent, LogoBackground, Project } from "@/model/project";
import { applyEdit } from "@/state/edits";
import { BLOCK_LADDER_BANNER, BLOCK_LADDER_FEED, BLOCK_LADDER_TYPE_ONLY, Block, HEADLINE_FLOOR } from "@/templates/block/Block";
import { detailItems, dateLine, headlineLines } from "@/templates/shared/details";
import { TEMPLATES } from "@/templates/registry";
import type { ImageSlot, TemplateImages } from "@/templates/types";
import { reviewProject } from "@/validation/projectChecks";

const photo: ImageSlot = { state: "ready", image: { url: "/photo.jpg", width: 1600, height: 1066 } };
const logo = (w = 400, h = 200): ImageSlot => ({ state: "ready", image: { url: `/logo-${w}x${h}.png`, width: w, height: h } });

function project(content: Partial<EventContent> = {}, opts: { format?: "feed" | "banner"; partners?: number; background?: LogoBackground } = {}): Project {
  const p = createBlankProject("t", new Date("2026-10-06T00:00:00Z"), { format: opts.format ?? "feed" });
  return {
    ...p,
    content: { ...p.content, ...content },
    logos: { background: opts.background ?? "none", partners: Array.from({ length: opts.partners ?? 0 }, (_, i) => ({ id: `p${i}`, source: { kind: "builtin" as const, id: `x${i}` } })) },
  };
}

function images(p: Project, withPhoto = false): TemplateImages {
  return { photo: withPhoto ? photo : { state: "empty" }, sis: SIS_DRAWABLE, partners: p.logos.partners.map((x) => ({ id: x.id, slot: logo() })) };
}

const render = (p: Project, img = images(p), mode: "editor" | "export" = "export") => renderToStaticMarkup(<Block project={p} images={img} mode={mode} />);
const count = (html: string, attr: string) => html.split(attr).length - 1;

describe("Block: registry and defaults", () => {
  it("Block is the default template; all five templates are built, each with one fixed detail style", () => {
    expect(createBlankProject("x").style.template).toBe("block");
    expect(TEMPLATES.filter((t) => t.component).map((t) => t.id).sort()).toEqual(["block", "broadsheet", "poster", "slab", "ticket"]);
    for (const t of TEMPLATES) expect(t.detailStyles).toHaveLength(1);
  });
});

describe("Block: blank and progressive population", () => {
  it("a blank creative is the type-only composition with only the SIS logo", () => {
    const html = render(project());
    expect(html).toContain('data-composition="type-only"');
    expect(html).toContain('data-slot="panel"');
    expect(html).not.toContain('data-slot="photo"');
    expect(count(html, 'data-logo="sis"')).toBe(1);
    expect(html).not.toContain('data-slot="headline"');
    expect(html).not.toContain("data-detail=");
    expect(html).not.toContain('data-slot="city"');
  });

  it("adding a photo switches to the photo composition; removing it switches back", () => {
    const p = project({ headline: "Run", venue: "Park" });
    const withPhoto = render(p, images(p, true));
    expect(withPhoto).toContain('data-composition="photo"');
    expect(withPhoto).toContain('data-slot="photo"');
    const without = render(p, images(p, false));
    expect(without).toContain('data-composition="type-only"');
    expect(without).not.toContain('data-slot="photo"');
    expect(without).toContain('data-detail="venue"');
  });

  it("a loading or missing photo keeps the photo composition (no flicker, missing is visible)", () => {
    const p = project({ headline: "Run" });
    expect(render(p, { ...images(p), photo: { state: "loading" } })).toContain('data-composition="photo"');
    expect(render(p, { ...images(p), photo: { state: "missing", name: "x" } })).toContain('data-composition="photo"');
  });

  it("type-only export has no photo hint; the editor shows one", () => {
    const p = project({ headline: "Run" });
    expect(render(p, images(p), "export")).not.toContain("Add a photo");
    expect(render(p, images(p), "editor")).toContain("Add a photo");
  });

  it("editor mode shows hints for the empty photo and headline; export never does", () => {
    const p = project();
    expect(render(p, images(p), "editor")).toContain('data-hint="true"');
    expect(render(p, images(p), "export")).not.toContain('data-hint="true"');
  });

  it("each field appears as soon as it has content", () => {
    let p = project();
    p = applyEdit(p, { type: "content", field: "headline", value: "Run Club" });
    expect(render(p)).toContain('data-slot="headline"');
    p = applyEdit(p, { type: "content", field: "venue", value: "Cubbon Park" });
    expect(render(p)).toContain('data-detail="venue"');
    expect(render(p)).not.toContain('data-detail="time"');
    p = applyEdit(p, { type: "content", field: "city", value: "Bangalore" });
    expect(render(p)).toContain('data-slot="city"');
  });

  it("a photo appears as soon as it's added, and goes when removed", () => {
    const p = project({ headline: "Run" });
    expect(render(p, images(p, true))).toContain('src="/photo.jpg"');
    expect(render(p, images(p, false))).not.toContain('src="/photo.jpg"');
  });

  it("clearing a field removes its element entirely (no empty box)", () => {
    let p = project({ headline: "Run", date: "1st May", time: "7 AM", venue: "Park" });
    expect(count(render(p), "data-detail=")).toBe(3);
    p = applyEdit(p, { type: "content", field: "time", value: "" });
    expect(count(render(p), "data-detail=")).toBe(2);
    p = applyEdit(p, { type: "content", field: "date", value: "  " });
    p = applyEdit(p, { type: "content", field: "venue", value: "" });
    expect(render(p)).not.toContain('data-slot="details"');
  });

  it("typed headline lines are kept as separate lines", () => {
    const html = render(project({ headline: "Padel\nCoaching\n\nWorkshop" }));
    expect(count(html, 'class="tpl-headline-line"')).toBe(3);
  });
});

describe("Block: logos", () => {
  it.each([0, 1, 2, 3, 4])("renders %i partner logos plus SIS", (n) => {
    const p = project({ headline: "X" }, { partners: n });
    const html = render(p);
    expect(count(html, 'data-logo="partner-')).toBe(n);
    expect(count(html, 'data-logo="sis"')).toBe(1);
  });

  it("logos have no plate by default", () => {
    const html = render(project({ headline: "X" }, { partners: 2 }));
    expect(html).toContain('data-logo-background="none"');
    expect(html).toMatch(/data-slot="logo"[^>]*/);
    expect(html).not.toMatch(/background:var\(--(paper|white)\)[^"]*"[^>]*data-slot="logo"/);
  });

  it.each(["paper", "white", "accent"] as const)("applies a %s plate to every logo when chosen", (bg) => {
    const html = render(project({ headline: "X" }, { partners: 2, background: bg }));
    const plates = html.match(/<div style="[^"]*background:var\(--[a-z-]+\)[^"]*" data-slot="logo"/g) ?? [];
    expect(plates).toHaveLength(3);
  });

  it("a missing logo file renders a placeholder, not an error", () => {
    const p = project({ headline: "X" }, { partners: 1 });
    const img = { ...images(p), partners: [{ id: "p0", slot: { state: "missing", name: "Aukera" } as ImageSlot }] };
    expect(render(p, img)).toContain('data-state="missing"');
  });
});

describe("Block: layout is flow-based", () => {
  it("only the photo fill, the overlay layer and hints are absolutely positioned", () => {
    const p = project({ headline: "Padel", date: "1st May", venue: "Park", city: "Bangalore" }, { partners: 2 });
    const html = render(p, images(p, true), "editor") + render(p, images(p, false), "editor");
    const absolute = html.match(/<[a-z0-9]+ [^>]*position:absolute[^>]*>/g) ?? [];
    // Allowed: the photo fill and its image, the tag/logo layer over the photo, editor hints.
    for (const tag of absolute) expect(tag).toMatch(/data-slot="photo-fill"|^<img src="\/photo\.jpg"|data-hint="true"|pointer-events:none/);
    expect(absolute.length).toBeLessThanOrEqual(5);
  });

  it("feed stacks photo over panel; banner puts them side by side", () => {
    const p = project({ headline: "X" });
    expect(render(p, images(p, true))).toMatch(/flex-direction:column/);
    const b = project({ headline: "X" }, { format: "banner" });
    expect(render(b, images(b, true))).toMatch(/data-format="banner"[\s\S]*flex-direction:row/);
  });

  it("fit ladders follow the agreed priority: share, then spacing, then headline (never below the floor)", () => {
    for (const ladder of [BLOCK_LADDER_FEED, BLOCK_LADDER_BANNER]) {
      expect(ladder[0]).toMatchObject({ spacing: 1, headline: 1 });
      const firstSpacing = ladder.findIndex((s) => s.spacing < 1);
      const firstType = ladder.findIndex((s) => s.headline < 1);
      // Photo/panel share changes before any spacing change...
      expect(ladder.slice(1, firstSpacing).every((s) => s.spacing === 1 && s.headline === 1 && s.vars)).toBe(true);
      expect(firstSpacing).toBeGreaterThan(1);
      // ...and spacing tightens before the headline shrinks.
      expect(firstType).toBeGreaterThan(firstSpacing);
    }
    const t = BLOCK_LADDER_TYPE_ONLY;
    expect(t.findIndex((s) => s.headline < 1)).toBeGreaterThan(t.findIndex((s) => s.spacing < 1));
    expect(HEADLINE_FLOOR).toBe(0.66);
  });

  it("the headline never shrinks to preserve line arrangement: font size has no line-fitting factor", () => {
    const html = render(project({ headline: "Sisters and Misters Basketball Game Night" }));
    expect(html).not.toContain("--hline");
    expect(html).toMatch(/max\(66/);
  });
});

describe("shared helpers", () => {
  it("date line joins date and day, either optional", () => {
    expect(dateLine({ date: "10th October", day: "Saturday" })).toBe("10th October, Saturday");
    expect(dateLine({ date: "", day: "Saturday" })).toBe("Saturday");
    expect(dateLine({ date: " ", day: "" })).toBe("");
  });

  it("detail items skip empty fields and keep date first", () => {
    const c = createBlankProject("x").content;
    expect(detailItems({ ...c, venue: "Park", time: "7 AM" }).map((d) => d.key)).toEqual(["time", "venue"]);
    expect(detailItems(c)).toEqual([]);
  });

  it("headline lines drop blanks and trim", () => {
    expect(headlineLines("  Padel \n\n Night ")).toEqual(["Padel", "Night"]);
  });

  it("optical logo sizing gives equal visual weight and respects clamps", () => {
    const sq = opticalLogoBox(400, 400, { base: 100 });
    const wide = opticalLogoBox(800, 200, { base: 100 });
    expect(sq).toEqual({ width: 100, height: 100 });
    expect(Math.round(wide.width * wide.height)).toBe(10000);
    const extreme = opticalLogoBox(3000, 100, { base: 100 });
    expect(extreme.width).toBeLessThanOrEqual(320);
    const tall = opticalLogoBox(100, 1000, { base: 100 });
    expect(tall.height).toBeLessThanOrEqual(125);
    expect(logoRowScale(0)).toBe(1);
    expect(logoRowScale(4)).toBeGreaterThanOrEqual(0.7);
  });
});

describe("review", () => {
  it("blank creative: headline needed; photo, date, time, venue flagged; nothing else", () => {
    const p = project();
    const ids = reviewProject(p, images(p), { status: "fits", step: 0 }).map((i) => `${i.level}:${i.id}`);
    expect(ids).toEqual(["blocking:headline", "warning:photo", "warning:date", "warning:time", "warning:venue"]);
  });

  it("low-res photo warns but never blocks", () => {
    const p = project({ headline: "X", date: "1", time: "2", venue: "3" });
    const issues = reviewProject(p, { ...images(p), photo: { state: "ready", image: { url: "/s.jpg", width: 720, height: 1280 } } }, null);
    expect(issues.map((i) => `${i.level}:${i.id}`)).toEqual(["warning:photo-low-res"]);
  });

  it("missing files and content that can't fit block export", () => {
    const p = project({ headline: "X", date: "1", time: "2", venue: "3" }, { partners: 1 });
    const issues = reviewProject(p, { ...images(p, true), partners: [{ id: "p0", slot: { state: "missing", name: "A" } }] }, { status: "cannot-fit", step: 7 });
    expect(issues.filter((i) => i.level === "blocking").map((i) => i.id)).toEqual(["logo-missing-p0", "fit"]);
  });
});
