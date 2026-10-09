import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { classifyTone } from "@/assets/logoTone";
import { createBlankProject } from "@/model/blank";
import type { EventContent, LogoBackground, Project, TemplateId } from "@/model/project";
import { applyEdit } from "@/state/edits";
import { groundTone, logoGroundHex } from "@/templates/logoGround";
import { TEMPLATES, findTemplate } from "@/templates/registry";
import type { ImageSlot, TemplateImages } from "@/templates/types";
import { reviewProject } from "@/validation/projectChecks";

/**
 * Every template, both formats: blank start, progressive population, removal
 * and reflow, template and format switching, square canvas, and flow layout.
 * (Geometry is checked in the browser by the /qa/templates matrix.)
 */

const IDS = TEMPLATES.map((t) => t.id);
const FORMATS = ["feed", "banner"] as const;
const DETAIL_STYLE: Record<TemplateId, string> = { block: "cards", broadsheet: "ledger", poster: "inline", slab: "rows", ticket: "tags" };

const photo: ImageSlot = { state: "ready", image: { url: "/photo.jpg", width: 1600, height: 1066 } };
const logo = (i: number, tone?: "dark" | "light"): ImageSlot => ({ state: "ready", image: { url: `/logo-${i}.png`, width: 400, height: 200, tone } });

function project(template: TemplateId, format: "feed" | "banner", content: Partial<EventContent> = {}, partners = 0, background: LogoBackground = "none"): Project {
  const p = createBlankProject("t", new Date("2026-10-06T00:00:00Z"), { template, format });
  return {
    ...p,
    content: { ...p.content, ...content },
    logos: { background, partners: Array.from({ length: partners }, (_, i) => ({ id: `p${i}`, source: { kind: "builtin" as const, id: `x${i}` } })) },
  };
}

function images(p: Project, withPhoto: boolean): TemplateImages {
  return { photo: withPhoto ? photo : { state: "empty" }, sis: SIS_DRAWABLE, partners: p.logos.partners.map((x, i) => ({ id: x.id, slot: logo(i) })) };
}

function render(p: Project, withPhoto = false, mode: "editor" | "export" = "export") {
  const C = findTemplate(p.style.template).component!;
  return renderToStaticMarkup(<C project={p} images={images(p, withPhoto)} mode={mode} />);
}
const count = (html: string, s: string) => html.split(s).length - 1;
const FULL = { headline: "Padel Night", date: "10th October", day: "Saturday", time: "6–8 PM", venue: "Hive Club", city: "Bangalore", notes: "Bring water" };

describe.each(IDS)("%s", (id) => {
  describe.each(FORMATS)("%s", (format) => {
    it("starts blank: structure and SIS only, at the exact export size", () => {
      const html = render(project(id, format));
      expect(html).toContain(`data-template="${id}"`);
      expect(html).toContain(`data-format="${format}"`);
      expect(html).toContain(format === "feed" ? "width:1080px;height:1350px" : "width:1600px;height:1000px");
      expect(count(html, 'data-logo="sis"')).toBe(1);
      for (const s of ['data-slot="headline"', "data-detail=", 'data-slot="city"', 'data-slot="notes"', 'src="/photo.jpg"']) expect(html).not.toContain(s);
    });

    it("the canvas root never has rounded corners", () => {
      const root = render(project(id, format, FULL, 2), true).match(/<div[^>]*class="tpl-canvas"[^>]*>/)![0];
      expect(root).not.toMatch(/border-radius/);
    });

    it("exports carry no editor hints; the editor shows them on a blank creative", () => {
      expect(render(project(id, format), false, "export")).not.toContain('data-hint="true"');
      expect(render(project(id, format), false, "editor")).toContain('data-hint="true"');
    });

    it("each field appears as soon as it has content", () => {
      let p = project(id, format);
      p = applyEdit(p, { type: "content", field: "headline", value: "Run Club" });
      expect(render(p)).toContain('data-slot="headline"');
      p = applyEdit(p, { type: "content", field: "date", value: "1st May" });
      expect(render(p)).toContain('data-detail="date"');
      p = applyEdit(p, { type: "content", field: "venue", value: "Park" });
      expect(render(p)).toContain('data-detail="venue"');
      p = applyEdit(p, { type: "content", field: "city", value: "Bangalore" });
      expect(render(p)).toContain('data-slot="city"');
      expect(render(p, true)).toContain('src="/photo.jpg"');
    });

    it("removing content removes its element; removing the photo returns to type-only", () => {
      let p = project(id, format, FULL);
      expect(count(render(p, true), "data-detail=")).toBe(3);
      p = applyEdit(p, { type: "content", field: "time", value: "" });
      expect(render(p, true)).not.toContain('data-detail="time"');
      p = applyEdit(p, { type: "content", field: "notes", value: "" });
      expect(render(p, true)).not.toContain('data-slot="notes"');
      expect(render(p, true)).toContain('data-composition="photo"');
      expect(render(p, false)).toContain('data-composition="type-only"');
    });

    it.each([0, 1, 2, 3, 4])("renders %i partner logos plus SIS, with no plates by default", (n) => {
      const html = render(project(id, format, FULL, n), true);
      expect(count(html, 'data-logo="partner-')).toBe(n);
      expect(count(html, 'data-logo="sis"')).toBe(1);
      expect(html).toContain('data-logo-background="none"');
    });

    it(`uses its one fixed detail style (${DETAIL_STYLE[id]})`, () => {
      expect(render(project(id, format, FULL), true)).toContain(`data-detail-style="${DETAIL_STYLE[id]}"`);
    });

    it("absolute positioning only for photo, overlay and hint layers", () => {
      const html = render(project(id, format, FULL, 2), true, "editor") + render(project(id, format, FULL, 2), false, "editor");
      // Any absolutely positioned element must be a marked layer, or the photo image inside the photo layer.
      for (const tag of html.match(/<[a-z0-9]+ [^>]*position:absolute[^>]*>/g) ?? []) {
        expect(tag).toMatch(/data-layer="(photo|overlay|hint)"|^<img src="\/photo\.jpg"/);
      }
    });
  });

  it("switching template keeps all content (only the composition changes)", () => {
    const from = project("block", "feed", FULL, 2);
    const to = applyEdit(from, { type: "style", style: { template: id } });
    const html = render(to, true);
    expect(html).toContain(`data-template="${id}"`);
    expect(count(html, "data-detail=")).toBe(3);
    expect(count(html, 'data-logo="partner-')).toBe(2);
    // The title is split into word spans (for balanced breaks) but reads as typed.
    expect(html.replace(/<[^>]+>/g, "")).toContain("Padel Night");
  });

  it("switching feed ↔ banner keeps all content and changes the canvas size", () => {
    const feed = project(id, "feed", FULL, 1);
    const banner = applyEdit(feed, { type: "style", style: { format: "banner" } });
    const a = render(feed, true);
    const b = render(banner, true);
    expect(a).toContain("width:1080px;height:1350px");
    expect(b).toContain("width:1600px;height:1000px");
    for (const html of [a, b]) {
      expect(count(html, "data-detail=")).toBe(3);
      expect(html.replace(/<[^>]+>/g, "")).toContain("Padel Night");
    }
  });
});

describe("logo legibility warning (never an automatic plate)", () => {
  it("classifies logo tone from opaque pixels only", () => {
    const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
    expect(classifyTone([...px(0, 0, 0), ...px(10, 10, 10), ...px(255, 255, 255, 0)])).toBe("dark");
    expect(classifyTone([...px(255, 255, 255), ...px(250, 250, 250)])).toBe("light");
    expect(classifyTone([...px(239, 96, 51), ...px(0, 0, 0)])).toBe("mixed");
    expect(classifyTone([...px(0, 0, 0, 0)])).toBe("mixed");
  });

  it("knows which templates put logos on a solid dark or light ground", () => {
    expect(groundTone(logoGroundHex(project("poster", "feed"), true))).toBe("dark");
    expect(groundTone(logoGroundHex(project("poster", "feed"), false))).toBeNull();
    expect(groundTone(logoGroundHex(project("ticket", "feed"), true))).toBe("light");
    expect(groundTone(logoGroundHex(project("broadsheet", "feed"), false))).toBe("light");
    expect(groundTone(logoGroundHex(project("slab", "feed"), true))).toBe("dark");
    expect(groundTone(logoGroundHex(project("block", "feed"), true))).toBeNull();
  });

  it("warns for a dark logo on a dark ground, and stops once a plate is chosen", () => {
    const p = project("poster", "feed", FULL, 1);
    const img: TemplateImages = { photo: { state: "empty" }, sis: SIS_DRAWABLE, partners: [{ id: "p0", slot: logo(0, "dark") }] };
    expect(reviewProject(p, img, null).some((i) => i.id === "logo-contrast-p0" && i.level === "warning")).toBe(true);
    const plated = { ...p, logos: { ...p.logos, background: "paper" as const } };
    expect(reviewProject(plated, img, null).some((i) => i.id.startsWith("logo-contrast"))).toBe(false);
  });

  it("warns for a light logo on paper", () => {
    const p = project("ticket", "feed", FULL, 1);
    const img: TemplateImages = { photo: { state: "empty" }, sis: SIS_DRAWABLE, partners: [{ id: "p0", slot: logo(0, "light") }] };
    expect(reviewProject(p, img, null).find((i) => i.id === "logo-contrast-p0")?.message).toMatch(/Accent/);
  });
});
