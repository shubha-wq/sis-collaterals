import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { COLORS } from "@/design-system/tokens";
import { exportFileName } from "@/export/filename";
import { exportReadiness } from "@/export/gate";
import { ARC_LIMITS, arcFor, insideArc } from "@/layout/arc";
import { KEEP_FOR_CROP, coverKeeps, planWebPhoto, resolveFill } from "@/layout/webPhotoPlan";
import { createBlankProject, normalizeProject } from "@/model/blank";
import { OUTPUTS, OUTPUT_ORDER, type OutputId, type WebFraming, type WebOutputId } from "@/model/outputs";
import type { EventContent, Project } from "@/model/project";
import { webFraming } from "@/model/webFraming";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbProjectStore, IndexedDbSessionStore } from "@/persistence/indexedDbProjectStore";
import { applyEdit } from "@/state/edits";
import { SessionController } from "@/state/sessionController";
import { rendererFor } from "@/templates/outputs";
import { TEMPLATES } from "@/templates/registry";
import type { ImageSlot, TemplateImages } from "@/templates/types";
import { EDGE_SHARE, edgeStrips } from "@/templates/website/extension";
import { reviewProject } from "@/validation/projectChecks";

/**
 * Website Banner and Website Listing: output types and sizes, one shared
 * photo, the never-distort photo plan, the Banner arc and the Listing's
 * plainness, filenames and the download gate. Pixel-level checks (real PNGs,
 * arc colour in the export, containment in the browser) run in /qa/web and
 * /qa/export.
 */

const TODAY = new Date(2026, 9, 7);
const W = 1600;
const H = 1000;

function project(output: OutputId, content: Partial<EventContent> = {}, partners = 0): Project {
  const p = createBlankProject("w", TODAY, { output, format: output === "instagram" ? "feed" : "banner" });
  return {
    ...p,
    content: { ...p.content, ...content },
    photo: { ...p.photo, source: { kind: "builtin", id: "padel-hive-club" } },
    logos: { background: "none", partners: Array.from({ length: partners }, (_, i) => ({ id: `p${i}`, source: { kind: "builtin" as const, id: `x${i}` } })) },
  };
}
const ready = (width: number, height: number, url = "/photo.jpg"): ImageSlot => ({ state: "ready", image: { url, width, height } });
function images(p: Project, photo: ImageSlot = ready(1800, 1200)): TemplateImages {
  return { photo, sis: SIS_DRAWABLE, partners: p.logos.partners.map((x, i) => ({ id: x.id, slot: ready(400, 200, `/logo-${i}.png`) })) };
}
function render(p: Project, photo: ImageSlot = ready(1800, 1200), mode: "editor" | "export" = "export") {
  const Component = rendererFor(p).Component!;
  return renderToStaticMarkup(<Component project={p} images={images(p, photo)} mode={mode} />);
}
const FULL = { headline: "Padel Coaching Workshop", date: "6th September", day: "Saturday", time: "10:00 AM – 11:30 AM", venue: "SS Sports, HSR Layout", city: "Bangalore" };

describe("output types", () => {
  it("are Instagram Creative 1080 × 1350, Website Banner and Website Listing 1600 × 1000", () => {
    expect(OUTPUT_ORDER).toEqual(["instagram", "website-banner", "website-listing"]);
    expect([OUTPUTS.instagram.width, OUTPUTS.instagram.height]).toEqual([1080, 1350]);
    expect([OUTPUTS["website-banner"].width, OUTPUTS["website-banner"].height]).toEqual([1600, 1000]);
    expect([OUTPUTS["website-listing"].width, OUTPUTS["website-listing"].height]).toEqual([1600, 1000]);
  });

  it("only Instagram uses the five templates", () => {
    expect(OUTPUTS.instagram.usesTemplates).toBe(true);
    expect(OUTPUTS["website-banner"].usesTemplates).toBe(false);
    expect(OUTPUTS["website-listing"].usesTemplates).toBe(false);
    const templateComponents = new Set(TEMPLATES.map((t) => t.component));
    for (const o of ["website-banner", "website-listing"] as const) {
      for (const t of TEMPLATES) {
        const r = rendererFor({ ...project(o), style: { ...project(o).style, template: t.id } });
        expect(templateComponents.has(r.Component)).toBe(false);
        expect([r.width, r.height]).toEqual([W, H]);
      }
    }
    for (const t of TEMPLATES) {
      const p = project("instagram");
      const r = rendererFor({ ...p, style: { ...p.style, template: t.id } });
      expect(r.Component).toBe(t.component);
      expect([r.width, r.height]).toEqual([1080, 1350]);
    }
  });

  it("a new creative is an Instagram Creative; older drafts load as Instagram feed creatives", () => {
    expect(createBlankProject("x").style.output).toBe("instagram");
    const legacy = createBlankProject("old", TODAY, { format: "banner" }) as Project;
    delete (legacy.style as Partial<Project["style"]>).output;
    const n = normalizeProject(legacy);
    expect(n.style.output).toBe("instagram");
    expect(n.style.format).toBe("feed");
    const web = project("website-banner");
    expect(normalizeProject(web)).toBe(web);
  });

  it("switching output keeps content, photo and logos, and Instagram is always feed", () => {
    let p = project("instagram", FULL, 2);
    p = applyEdit(p, { type: "photo-framing", focusX: 30 });
    const source = p.photo.source;
    for (const o of ["website-banner", "website-listing", "instagram", "website-listing", "website-banner"] as const) {
      p = applyEdit(p, { type: "output", output: o });
      expect(p.style.output).toBe(o);
      expect(p.photo.source).toBe(source);
      expect(p.content.headline).toBe(FULL.headline);
      expect(p.logos.partners).toHaveLength(2);
      expect(p.photo.focusX).toBe(30);
    }
    p = applyEdit(p, { type: "output", output: "instagram" });
    expect(p.style.format).toBe("feed");
    expect(rendererFor(p).height).toBe(1350);
  });
});

describe("one shared source photo", () => {
  it("is a single reference used by every output", () => {
    const p = project("website-banner");
    const html = OUTPUT_ORDER.map((o) => render({ ...p, style: { ...p.style, output: o, format: o === "instagram" ? "feed" : "banner" } }, ready(1800, 1200, "/shared.jpg")));
    // Exactly one <img> of the shared photo per output (no copies, no duplicates).
    html.forEach((h, i) => expect([OUTPUT_ORDER[i], (h.match(/<img[^>]*\/shared\.jpg/g) ?? []).length]).toEqual([OUTPUT_ORDER[i], 1]));
  });

  it("replacing the photo updates all outputs and resets every website framing", () => {
    let p = project("website-banner");
    p = applyEdit(p, { type: "web-framing", output: "website-banner", fill: "fit", focusX: 20 });
    p = applyEdit(p, { type: "web-framing", output: "website-listing", fill: "crop", zoom: 2 });
    expect(p.photo.web?.["website-banner"]).toEqual({ fill: "fit", focusX: 20 });
    p = applyEdit(p, { type: "photo", source: { kind: "builtin", id: "run-cubbon-park" } });
    expect(p.photo.source).toEqual({ kind: "builtin", id: "run-cubbon-park" });
    expect(p.photo.web).toBeUndefined();
    for (const o of OUTPUT_ORDER) expect(applyEdit(p, { type: "output", output: o }).photo.source).toEqual({ kind: "builtin", id: "run-cubbon-park" });
  });

  it("framing is per website output and never changes the Instagram framing", () => {
    let p = project("website-listing");
    p = applyEdit(p, { type: "web-framing", output: "website-listing", focusY: 10 });
    expect(webFraming(p, "website-listing").focusY).toBe(10);
    expect(webFraming(p, "website-banner").focusY).toBe(50);
    expect(p.photo.focusY).toBe(50);
    p = applyEdit(p, { type: "reset-web-framing", output: "website-listing" });
    expect(webFraming(p, "website-listing").focusY).toBe(50);
    p = applyEdit(p, { type: "web-framing", output: "website-banner", zoom: 9, focusX: -5 });
    expect(webFraming(p, "website-banner")).toMatchObject({ zoom: 2.5, focusX: 0 });
  });

  it("on the Banner a whole photo starts at the left (clear of the arc); the Listing centres it", () => {
    const p = project("website-banner");
    expect(webFraming(p, "website-banner", { width: 1000, height: 1000 }).focusX).toBe(0);
    expect(webFraming(p, "website-banner", { width: 1800, height: 1200 }).focusX).toBe(50);
    expect(webFraming(p, "website-listing", { width: 1000, height: 1000 }).focusX).toBe(50);
  });

  it("New creative keeps the output (with template and format) and nothing else", async () => {
    const db = await openDatabase("sis-web-carry", new IDBFactory());
    const c = new SessionController({ projects: new IndexedDbProjectStore(db), session: new IndexedDbSessionStore(db), autosaveMs: 5, newId: () => `n-${Math.random()}` });
    await c.start();
    c.edit({ type: "output", output: "website-banner" });
    c.edit({ type: "content", field: "headline", value: "Old" });
    c.edit({ type: "photo", source: { kind: "builtin", id: "padel-hive-club" } });
    await c.newCreative();
    const p = c.getSnapshot().project;
    expect(p.style.output).toBe("website-banner");
    expect(p.content.headline).toBe("");
    expect(p.photo.source).toBeNull();
  });
});

describe("photo plan: never stretched, subject kept", () => {
  const SIZES: Array<[number, number]> = [[1800, 1200], [1600, 1200], [1920, 1080], [1600, 1000], [1000, 1000], [720, 1280], [1080, 1350], [3200, 800], [500, 2400], [200, 150], [4000, 6000]];
  const FRAMINGS: WebFraming[] = [
    { fill: "auto", focusX: 50, focusY: 50, zoom: 1 },
    { fill: "crop", focusX: 0, focusY: 100, zoom: 1 },
    { fill: "crop", focusX: 80, focusY: 20, zoom: 2.5 },
    { fill: "fit", focusX: 0, focusY: 50, zoom: 1 },
    { fill: "fit", focusX: 100, focusY: 0, zoom: 2 },
  ];

  it("always draws the photo at its own aspect ratio, once, and covers the whole 1600 × 1000 canvas", () => {
    for (const [sw, sh] of SIZES) {
      for (const f of FRAMINGS) {
        const plan = planWebPhoto(sw, sh, W, H, f);
        expect(plan.photo.w / plan.photo.h).toBeCloseTo(sw / sh, 9);
        expect(plan.photo.w / sw).toBeCloseTo(plan.photo.h / sh, 9);
        // Photo plus extension gaps tile the canvas exactly, without overlapping.
        const visible = (Math.min(W, plan.photo.x + plan.photo.w) - Math.max(0, plan.photo.x)) * (Math.min(H, plan.photo.y + plan.photo.h) - Math.max(0, plan.photo.y));
        const gaps = plan.gaps.reduce((a, g) => a + g.w * g.h, 0);
        expect(visible + gaps).toBeCloseTo(W * H, 3);
        for (const g of plan.gaps) {
          const overlapX = Math.min(g.x + g.w, plan.photo.x + plan.photo.w) - Math.max(g.x, plan.photo.x);
          const overlapY = Math.min(g.y + g.h, plan.photo.y + plan.photo.h) - Math.max(g.y, plan.photo.y);
          expect(overlapX <= 0.001 || overlapY <= 0.001).toBe(true);
        }
      }
    }
  });

  it("crop covers the frame; whole photo keeps every pixel of the photo in frame", () => {
    for (const [sw, sh] of SIZES) {
      const crop = planWebPhoto(sw, sh, W, H, { fill: "crop", focusX: 50, focusY: 50, zoom: 1 });
      expect(crop.photo.x).toBeLessThanOrEqual(0.001);
      expect(crop.photo.y).toBeLessThanOrEqual(0.001);
      expect(crop.photo.x + crop.photo.w).toBeGreaterThanOrEqual(W - 0.001);
      expect(crop.photo.y + crop.photo.h).toBeGreaterThanOrEqual(H - 0.001);
      const fit = planWebPhoto(sw, sh, W, H, { fill: "fit", focusX: 50, focusY: 50, zoom: 2 });
      expect(fit.kept).toBe(1);
      expect(fit.photo.x).toBeGreaterThanOrEqual(-0.001);
      expect(fit.photo.y).toBeGreaterThanOrEqual(-0.001);
      expect(fit.photo.x + fit.photo.w).toBeLessThanOrEqual(W + 0.001);
      expect(fit.photo.y + fit.photo.h).toBeLessThanOrEqual(H + 0.001);
    }
  });

  it("Auto crops only when most of the photo stays (16:10 frame); otherwise shows it whole", () => {
    expect(KEEP_FOR_CROP).toBeGreaterThanOrEqual(0.7);
    const auto = (w: number, h: number) => resolveFill({ fill: "auto" }, w, h, W, H);
    expect(auto(1800, 1200)).toBe("crop"); // 3:2 keeps 94%
    expect(auto(1600, 1200)).toBe("crop"); // 4:3 keeps 83%
    expect(auto(1920, 1080)).toBe("crop"); // 16:9 keeps 90%
    expect(auto(1600, 1000)).toBe("crop");
    expect(auto(1000, 1000)).toBe("fit"); // square would lose 37.5%
    expect(auto(1080, 1350)).toBe("fit"); // portrait
    expect(auto(720, 1280)).toBe("fit");
    expect(auto(3200, 800)).toBe("fit"); // panorama
    expect(coverKeeps(1000, 1000, W, H)).toBeCloseTo(0.625, 3);
    // A person at the edge of a square photo is still in frame under Auto.
    const plan = planWebPhoto(1000, 1000, W, H, { fill: "auto", focusX: 50, focusY: 50, zoom: 1 });
    const personAt = { x: plan.photo.x + 0.95 * plan.photo.w, y: plan.photo.y + 0.5 * plan.photo.h };
    expect(personAt.x).toBeLessThan(W);
    expect(personAt.y).toBeLessThan(H);
  });

  it("cropping keeps the focal point in frame, also when zoomed", () => {
    for (const [fx, fy] of [[0, 0], [100, 100], [30, 70], [90, 10]] as const) {
      for (const zoom of [1, 1.6, 2.5]) {
        const plan = planWebPhoto(1600, 1200, W, H, { fill: "crop", focusX: fx, focusY: fy, zoom });
        const px = plan.photo.x + (fx / 100) * plan.photo.w;
        const py = plan.photo.y + (fy / 100) * plan.photo.h;
        expect(px).toBeGreaterThanOrEqual(-0.001);
        expect(px).toBeLessThanOrEqual(W + 0.001);
        expect(py).toBeGreaterThanOrEqual(-0.001);
        expect(py).toBeLessThanOrEqual(H + 0.001);
      }
    }
  });

  it("the background extension reads only the photo's outermost edge, on the sides that border free space", () => {
    for (const [sw, sh] of [[1000, 1000], [720, 1280], [3200, 800], [500, 2400]] as const) {
      const plan = planWebPhoto(sw, sh, W, H, { fill: "fit", focusX: 50, focusY: 50, zoom: 1 });
      const strips = edgeStrips(sw, sh, plan);
      expect(strips).toHaveLength(plan.gaps.length);
      for (const s of strips) {
        if (s.side === "left") expect(s.src.x + s.src.w).toBeLessThanOrEqual(Math.ceil(sw * EDGE_SHARE));
        if (s.side === "right") expect(s.src.x).toBeGreaterThanOrEqual(Math.floor(sw * (1 - EDGE_SHARE)));
        if (s.side === "top") expect(s.src.y + s.src.h).toBeLessThanOrEqual(Math.ceil(sh * EDGE_SHARE));
        if (s.side === "bottom") expect(s.src.y).toBeGreaterThanOrEqual(Math.floor(sh * (1 - EDGE_SHARE)));
      }
    }
    // Pushed to one side: only the opposite side is extended.
    const left = planWebPhoto(1000, 1000, W, H, { fill: "fit", focusX: 0, focusY: 50, zoom: 1 });
    expect(edgeStrips(1000, 1000, left).map((s) => s.side)).toEqual(["right"]);
    // A 16:10 crop has nothing to extend.
    expect(edgeStrips(1600, 1000, planWebPhoto(1600, 1000, W, H, { fill: "auto", focusX: 50, focusY: 50, zoom: 1 }))).toEqual([]);
  });
});

describe("Website Banner", () => {
  it("has the SIS coral arc as a decorative layer anchored top-right", () => {
    const html = render(project("website-banner", FULL));
    expect(html).toMatch(/data-template="website-banner"/);
    expect(html).toMatch(/<svg[^>]*data-layer="decor"[^>]*data-slot="arc"/);
    const arc = html.match(/<svg[^>]*data-slot="arc"[^>]*>/)![0];
    expect(arc).toMatch(/position:absolute/);
    expect(arc).toMatch(/top:0/);
    expect(arc).toMatch(/right:0/);
    expect(html).toContain(`fill="${COLORS.coral}"`);
    expect(COLORS.coral.toUpperCase()).toBe("#EF6033");
    // Quarter ellipse from the top edge curving down to the right edge, centred on the corner.
    expect(html).toContain('d="M0 0 A100 100 0 0 0 100 100 L100 0 Z"');
  });

  it("lays the info out in flow inside the arc, never absolutely", () => {
    const html = render(project("website-banner", FULL));
    const info = html.match(/<div[^>]*data-slot="arc-content"[^>]*>/)![0];
    expect(info).not.toMatch(/position:absolute/);
    expect(html.replace(/<[^>]+>/g, "")).toContain("Padel Coaching Workshop");
    for (const label of ["Date:", "Time:", "Venue:"]) expect(html).toContain(label);
    // Date and day are separate spans (independently colourable) but read as one line.
    expect(html.replace(/<[^>]+>/g, "")).toContain("6th September, Saturday");
    expect(html).toContain("Bangalore");
    // Absolute positioning only on marked layers.
    const absolute = html.match(/<[a-z]+[^>]*position:absolute[^>]*>/g) ?? [];
    for (const tag of absolute) expect(tag).toMatch(/data-layer="(photo|decor|hint)"|data-slot="photo-(image|extension)"/);
  });

  it("long text wraps (no nowrap on info) and the info column widens before type shrinks", async () => {
    const html = render(project("website-banner", { ...FULL, venue: "St. Joseph's University Indoor Basketball Court, Langford Road, Shanthala Nagar" }));
    const venue = html.match(/<span[^>]*data-detail="venue"[^>]*>/)![0];
    expect(venue).not.toMatch(/nowrap/);
    expect(venue).toMatch(/overflow-wrap:anywhere/);
    const { BANNER_LADDER } = await import("@/templates/website/WebsiteBanner");
    const widths = BANNER_LADDER.map((s) => parseFloat(s.vars?.["--info-max"] ?? "0"));
    const firstHeadlineStep = BANNER_LADDER.findIndex((s) => s.headline < 1);
    expect(Math.max(...widths.slice(0, firstHeadlineStep))).toBe(Math.max(...widths));
    expect(widths.slice(0, 5)).toEqual([...widths.slice(0, 5)].sort((a, b) => a - b));
  });

  it("every field is optional: photo only, + headline, + details, + logos, all", () => {
    const cases: Array<[Partial<EventContent>, number]> = [[{}, 0], [{ headline: "Run Club" }, 0], [{ date: "6th September", time: "10 AM", venue: "SS Sports" }, 0], [{}, 2], [FULL, 4]];
    for (const [content, partners] of cases) {
      const p = project("website-banner", content, partners);
      const html = render(p);
      expect(html).toMatch(/data-slot="arc"/);
      expect(html.includes('data-slot="headline"')).toBe(!!content.headline);
      expect(html.includes("Date:")).toBe(!!content.date);
      expect(html.includes("Venue:")).toBe(!!content.venue);
      expect((html.match(/data-logo="partner-/g) ?? []).length).toBe(partners);
      expect(html).toMatch(/data-logo="sis"/);
      // Photo-only and partial banners can be downloaded.
      const issues = reviewProject(p, images(p), { status: "fits", step: 0 });
      expect(exportReadiness(issues, images(p)).ok).toBe(true);
    }
    // No empty arc box when there's no info; no editor ghost headline.
    expect(render(project("website-banner"), ready(1800, 1200), "editor")).not.toMatch(/arc-content|tpl-ghost/);
  });

  it("removing a field removes it from the arc", () => {
    let p = project("website-banner", FULL);
    p = applyEdit(p, { type: "content", field: "time", value: "" });
    p = applyEdit(p, { type: "content", field: "city", value: "" });
    const html = render(p);
    expect(html).not.toContain("Time:");
    expect(html).not.toContain('data-slot="city"');
    expect(html).toContain("Venue:");
  });

  it("shows only Banner content (subheader and notes stay in the project but aren't drawn)", () => {
    const html = render(project("website-banner", { ...FULL, subheader: "SUBHEAD", notes: "NOTES TEXT" }));
    expect(html).not.toContain("SUBHEAD");
    expect(html).not.toContain("NOTES TEXT");
  });

  it("logos use the existing logo row and plates, bottom-left", () => {
    const p = { ...project("website-banner", FULL, 3), logos: { ...project("website-banner", FULL, 3).logos, background: "paper" as const } };
    const html = render(p);
    expect(html).toMatch(/data-slot="logo-bar"/);
    expect(html).toMatch(/data-logo-background="paper"/);
    expect((html.match(/data-logo="partner-/g) ?? []).length).toBe(3);
  });

  it("the arc is sized to hold the info, between a bold minimum and a maximum", () => {
    const empty = arcFor(0, 0, W, H, 48);
    expect(empty.a).toBeCloseTo(ARC_LIMITS.minW * W);
    expect(empty.b).toBeCloseTo(ARC_LIMITS.minH * H);
    expect(empty.fits).toBe(true);
    let prev = 0;
    for (const reachY of [200, 400, 600]) {
      const arc = arcFor(560, reachY, W, H, 48);
      expect(insideArc(560, reachY, arc)).toBe(true); // the info's far corner is inside
      expect(insideArc(560 + 48, reachY + 48, arc)).toBe(true); // with breathing room
      expect(arc.b).toBeGreaterThanOrEqual(prev);
      prev = arc.b;
    }
    expect(arcFor(800, 900, W, H, 48).fits).toBe(false);
    expect(insideArc(W, 0, { a: 600, b: 500 })).toBe(false);
    expect(insideArc(0, 0, { a: 600, b: 500 })).toBe(true);
  });

  it("a cannot-fit banner blocks download with a reason", () => {
    const p = project("website-banner", FULL);
    const r = exportReadiness(reviewProject(p, images(p), { status: "cannot-fit", step: 9 }), images(p));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/arc/);
  });
});

describe("Website Listing", () => {
  it("is the photo only: no arc, no text, no logos", () => {
    const html = render(project("website-listing", FULL, 3));
    expect(html).toMatch(/data-template="website-listing"/);
    expect(html).not.toMatch(/data-slot="arc"/);
    expect(html).not.toMatch(/data-slot="headline"|data-detail|data-slot="city"/);
    expect(html).not.toMatch(/data-slot="logo"/);
    expect(html).not.toContain("Padel");
    expect(html).toMatch(/width:1600px;height:1000px/);
  });

  it("fills the frame by cropping a landscape photo, at its own aspect ratio", () => {
    const html = render(project("website-listing"), ready(1800, 1200));
    expect(html).toMatch(/data-fill="crop"/);
    const [x, y, w, h] = html.match(/data-photo-rect="([^"]+)"/)![1]!.split(",").map(Number) as [number, number, number, number];
    expect(w / h).toBeCloseTo(1.5, 3);
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
    expect(x + w).toBeGreaterThanOrEqual(W - 0.01);
    expect(y + h).toBeGreaterThanOrEqual(H - 0.01);
    expect(html).not.toMatch(/object-fit:fill/);
  });

  it("shows a portrait photo whole; the sides wait for the AI landscape (no edge fill unless AI is unavailable)", () => {
    const html = render(project("website-listing"), ready(720, 1280));
    expect(html).toMatch(/data-fill="fit"/);
    expect(html).toMatch(/data-landscape="idle"/);
    expect(html).not.toMatch(/photo-extension|data-pending/);
    const [x, , w, h] = html.match(/data-photo-rect="([^"]+)"/)![1]!.split(",").map(Number) as [number, number, number, number];
    expect(h).toBeCloseTo(H, 3);
    expect(w / h).toBeCloseTo(720 / 1280, 3);
    expect(x).toBeCloseTo((W - w) / 2, 1);
    // Only when AI expansion isn't configured: the soft edge fill (emergency fallback).
    const p = project("website-listing");
    const C = rendererFor(p).Component!;
    const fallback = renderToStaticMarkup(<C project={p} images={{ ...images(p, ready(720, 1280)), expansionStatus: { state: "unavailable", message: "x" } }} mode="export" />);
    expect(fallback).toMatch(/data-landscape="fallback"/);
    expect(fallback).toMatch(/data-pending="true"/);
  });

  it("needs a photo, but no headline or details", () => {
    const p = project("website-listing");
    const none = reviewProject(p, images(p, { state: "empty" }), { status: "fits", step: 0 });
    expect(none.find((i) => i.id === "photo-required")?.level).toBe("blocking");
    const ok = reviewProject(p, images(p), { status: "fits", step: 0 });
    expect(ok.filter((i) => i.level === "blocking")).toEqual([]);
    expect(ok.some((i) => i.id === "date" || i.id === "headline")).toBe(false);
  });

  it("ignores missing partner logos (it draws none); blocks while the landscape is pending; warns about the fallback or small photos", () => {
    const p = project("website-listing", {}, 1);
    const imgs: TemplateImages = { ...images(p, ready(720, 1280)), partners: [{ id: "p0", slot: { state: "missing", name: "Gone" } }] };
    const pending = reviewProject(p, imgs, { status: "fits", step: 0 });
    expect(pending.filter((i) => i.level === "blocking").map((i) => i.id)).toEqual(["expansion-pending"]);
    const unavailable = reviewProject(p, { ...imgs, expansionStatus: { state: "unavailable", message: "x" } }, { status: "fits", step: 0 });
    expect(unavailable.filter((i) => i.level === "blocking")).toEqual([]);
    expect(unavailable.some((i) => i.id === "expansion-unavailable" && i.level === "warning")).toBe(true);
    const small = reviewProject(p, images(p, ready(640, 400)), { status: "fits", step: 0 });
    expect(small.some((i) => i.id === "photo-low-res")).toBe(true);
  });
});

describe("download", () => {
  it("names files per output, leaving out missing parts", () => {
    const at = (o: OutputId, c: Partial<EventContent>) => exportFileName(project(o, c), TODAY);
    expect(at("website-banner", { city: "Bangalore", date: "12th October" })).toBe("SIS_Bangalore_12-Oct-2026_Website-Banner.png");
    expect(at("website-listing", { city: "Bangalore", date: "12th October" })).toBe("SIS_Bangalore_12-Oct-2026_Website-Listing.png");
    expect(at("instagram", { city: "Bangalore", date: "12th October" })).toBe("SIS_Bangalore_12-Oct-2026_Block_Instagram-Creative.png");
    expect(at("website-banner", {})).toBe("SIS_Website-Banner.png");
    expect(at("website-listing", { date: "1st Nov" })).toBe("SIS_01-Nov-2026_Website-Listing.png");
    expect(at("website-banner", { city: 'Mumbai / Navi: "West"' })).toBe("SIS_Mumbai-Navi-West_Website-Banner.png");
  });

  it("export renders in export mode with no editor hints", () => {
    for (const o of ["website-banner", "website-listing"] as WebOutputId[]) {
      const editorEmpty = render(project(o), { state: "empty" }, "editor");
      expect(editorEmpty).toMatch(/data-hint="true"/);
      const exported = render(project(o, FULL, 1), ready(1800, 1200), "export");
      expect(exported).not.toMatch(/data-hint="true"/);
      expect(exported).not.toMatch(/box-shadow/);
    }
  });
});
