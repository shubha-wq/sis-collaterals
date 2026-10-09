import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { CREATIVE_RADIUS, IMAGE_RADIUS } from "@/design-system/tokens";
import { BANNER_FIELDS, ContentSection } from "@/editor/sections/ContentSection";
import { LogosSection } from "@/editor/sections/LogosSection";
import { createBlankProject } from "@/model/blank";
import type { EventContent, Project, TemplateId } from "@/model/project";
import { applyEdit } from "@/state/edits";
import { rendererFor } from "@/templates/outputs";
import { TEMPLATES } from "@/templates/registry";

/**
 * Editor panel UX: text colour controls live beside their Content fields
 * (no separate section), logos are chosen with dropdowns (no thumbnails),
 * and contained photos use the image radius while the canvas stays square.
 */

const noop = () => {};
const FULL: Partial<EventContent> = { headline: "Run", subheader: "SIS", date: "1st Nov", day: "Sat", time: "7 AM", venue: "Park", city: "Pune", notes: "Water" };
function project(template: TemplateId = "block", output: Project["style"]["output"] = "instagram"): Project {
  let p = createBlankProject("x", new Date(), { template, output, format: output === "instagram" ? "feed" : "banner" });
  for (const [k, v] of Object.entries(FULL)) p = applyEdit(p, { type: "content", field: k as keyof EventContent, value: v! });
  return p;
}
const content = (p: Project, only?: ReadonlyArray<keyof EventContent>) => renderToStaticMarkup(<ContentSection project={p} edit={noop} open onToggle={noop} only={only} />);
const buttons = (html: string) => [...html.matchAll(/aria-label="([^"]+) text colour \(([^)]*)\)"/g)].map((m) => [m[1], m[2]]);

describe("text colour controls inside Content", () => {
  it("each field has its own compact colour control beside the input", () => {
    const html = content(project("block"));
    expect(buttons(html).map((b) => b[0])).toEqual(["Event title", "Subheader", "Date", "Day", "Time", "Venue", "City", "Additional details"]);
    // Beside the input: the control sits in the same row wrapper as its field.
    expect(html).toMatch(/<div class="field-with-colour"><input id="field-venue"[^>]*\/><div class="colour-control">/);
  });

  it("covers the label too where the design prints labels, and not where it doesn't", () => {
    expect(buttons(content(project("block"))).find((b) => b[0] === "Venue")![1]).toBe("Venue: Auto, Venue label: Auto");
    expect(buttons(content(project("slab"))).find((b) => b[0] === "Time")![1]).toBe("Time: Auto, Time label: Auto");
    expect(buttons(content(project("poster"))).find((b) => b[0] === "Venue")![1]).toBe("Venue: Auto");
    expect(buttons(content(project("broadsheet"))).find((b) => b[0] === "Date")![1]).toBe("Date: Auto");
  });

  it("shows only the fields the output uses (Banner: no subheader or notes)", () => {
    const banner = buttons(content(project("block", "website-banner"), BANNER_FIELDS)).map((b) => b[0]);
    expect(banner).toEqual(["Event title", "Date", "Day", "Time", "Venue", "City"]);
    expect(buttons(content(project("block", "website-banner"), BANNER_FIELDS)).find((b) => b[0] === "Date")![1]).toBe("Date: Auto, Date label: Auto");
  });

  it("each control reports its own colour only", () => {
    const p = applyEdit(applyEdit(project("block"), { type: "text-colour", role: "venue", colour: "teal" }), { type: "text-colour", role: "time-label", colour: "coral" });
    const b = Object.fromEntries(buttons(content(p)));
    expect(b.Venue).toBe("Venue: Teal, Venue label: Auto");
    expect(b.Time).toBe("Time: Auto, Time label: Coral");
    expect(b["Event title"]).toBe("Event title: Auto");
    expect(b.Date).toBe("Date: Auto, Date label: Auto");
  });

  it("there is no separate Text colours section any more", () => {
    const dir = join(__dirname, "../src/editor");
    const files = [...readdirSync(dir), ...readdirSync(join(dir, "sections")).map((f) => `sections/${f}`)].filter((f) => f.endsWith(".tsx"));
    expect(files).not.toContain("sections/TextColoursSection.tsx");
    for (const f of files) expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/title="Text colours"/);
  });
});

describe("logos: dropdowns only", () => {
  it("one dropdown per partner slot, no thumbnails or images in the panel", () => {
    const html = renderToStaticMarkup(<LogosSection logos={{ partners: [], background: "none" }} edit={noop} library={null} open onToggle={noop} />);
    expect(html).not.toMatch(/<img/);
    expect(html.match(/<select id="field-partner-\d"/g)).toHaveLength(1);
    expect(html).toContain("Select logo");
    expect(html).toMatch(/<option value="b:nike">Nike<\/option>/);
    expect(html).not.toMatch(/value="b:sis/); // SIS is automatic, never a partner choice
    expect(html).toContain("Sisters in Sweat is always included");
  });

  it("shows the chosen logos by name, plus one empty slot, up to four", () => {
    const partners = [
      { id: "a", source: { kind: "builtin" as const, id: "nike" } },
      { id: "b", source: { kind: "upload" as const, blobId: "f".repeat(64), name: "Hive Club" } },
    ];
    const html = renderToStaticMarkup(<LogosSection logos={{ partners, background: "paper" }} edit={noop} library={null} open onToggle={noop} />);
    expect(html.match(/<select id="field-partner-\d"/g)).toHaveLength(3);
    expect(html).toMatch(/<option value="u:f{64}" selected="">Hive Club<\/option>/);
    expect(html).toMatch(/<option value="b:nike" disabled="">Nike \(already added\)<\/option>/); // no duplicates across slots
    const four = renderToStaticMarkup(<LogosSection logos={{ partners: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, source: { kind: "upload" as const, blobId: String(i).repeat(64), name: `L${i}` } })), background: "none" }} edit={noop} library={null} open onToggle={noop} />);
    expect(four.match(/<select id="field-partner-\d"/g)).toHaveLength(4);
    expect(four).toContain("maximum of 4");
  });

  it("changing a slot replaces that logo in place; duplicates and a fifth logo are refused", () => {
    let p = createBlankProject("x");
    p = applyEdit(p, { type: "add-partner", logo: { id: "a", source: { kind: "builtin", id: "nike" } } });
    p = applyEdit(p, { type: "add-partner", logo: { id: "b", source: { kind: "upload", blobId: "1".repeat(64), name: "One" } } });
    p = applyEdit(p, { type: "replace-partner", id: "a", logo: { id: "c", source: { kind: "upload", blobId: "2".repeat(64), name: "Two" } } });
    expect(p.logos.partners.map((l) => l.id)).toEqual(["c", "b"]);
    expect(applyEdit(p, { type: "replace-partner", id: "c", logo: { id: "d", source: { kind: "upload", blobId: "1".repeat(64), name: "One" } } })).toBe(p);
    for (let i = 3; i < 8; i++) p = applyEdit(p, { type: "add-partner", logo: { id: `x${i}`, source: { kind: "upload", blobId: String(i).repeat(64), name: `${i}` } } });
    expect(p.logos.partners).toHaveLength(4);
  });
});

describe("image corners", () => {
  const photo = { state: "ready" as const, image: { url: "/p.jpg", width: 1600, height: 1066 } };
  const render = (p: Project) => {
    const C = rendererFor(p).Component!;
    return renderToStaticMarkup(<C project={p} images={{ photo, sis: SIS_DRAWABLE, partners: [] }} mode="export" />);
  };

  it("the image radius is a step of the creative scale, softer than before", () => {
    expect(IMAGE_RADIUS).toBe("large");
    expect(CREATIVE_RADIUS[IMAGE_RADIUS]).toBeGreaterThan(CREATIVE_RADIUS.subtle);
  });

  it("a contained photo is clipped to the image radius; the canvas stays square", () => {
    for (const f of ["feed", "banner"] as const) {
      const p = createBlankProject("x", new Date(), { template: "broadsheet", format: f });
      const html = render(p);
      expect(html).toMatch(/border-radius:var\(--r-large\);overflow:hidden/);
      expect(html).toMatch(/data-slot="photo-fill"[^>]*style="[^"]*overflow:hidden[^"]*border-radius:inherit/);
      expect(html).not.toMatch(/class="tpl-canvas"[^>]*border-radius/);
    }
  });

  it("full-bleed photos (on the canvas edge) are not rounded", () => {
    for (const t of TEMPLATES.map((x) => x.id).filter((x) => x !== "broadsheet")) {
      expect(render(createBlankProject("x", new Date(), { template: t })), t).not.toMatch(/--r-large/);
    }
    for (const o of ["website-banner", "website-listing"] as const) expect(render(createBlankProject("x", new Date(), { output: o, format: "banner" })), o).not.toMatch(/--r-large/);
  });
});
