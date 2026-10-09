import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { TEXT_COLOURS } from "@/design-system/brand";
import { COLORS, color } from "@/design-system/tokens";
import { exportReadiness } from "@/export/gate";
import { MemoryLibraryBackend, MemorySharedAssets } from "@/library/memory";
import { CreativeLibrary } from "@/library/service";
import { createBlankProject } from "@/model/blank";
import type { EventContent, Project, TemplateId, TextColourChoice, TextRole } from "@/model/project";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { IndexedDbProjectStore } from "@/persistence/indexedDbProjectStore";
import { applyEdit } from "@/state/edits";
import { rendererFor } from "@/templates/outputs";
import { TEMPLATES } from "@/templates/registry";
import { MIN_TEXT_CONTRAST, parseColor, ratioOf, type ContrastReading } from "@/templates/shared/contrast";
import { makePaint } from "@/templates/shared/paint";
import { BANNER_TEXT_ROLES, TEMPLATE_TEXT_ROLES, textRolesFor } from "@/templates/textRoles";
import type { ImageSlot, TemplateImages } from "@/templates/types";
import { contrastWarnings, reviewProject } from "@/validation/projectChecks";

/**
 * Independent text colours: each semantic text block has its own optional
 * colour from the approved palette. Checked on the markup every template
 * renders (the same markup the export renders), across all five templates,
 * both compositions, with and without a photo, plus the Website Banner.
 * Pixel-level proof that the PNG carries them is in /qa/export.
 */

const IDS = TEMPLATES.map((t) => t.id);
const FULL: Partial<EventContent> = { headline: "Sweat Session", subheader: "SIS × Hive", date: "12th October", day: "Sunday", time: "7 AM", venue: "Indiranagar", city: "Bangalore", notes: "Bring water" };
const photo: ImageSlot = { state: "ready", image: { url: "/photo.jpg", width: 1600, height: 1066 } };

function project(template: TemplateId, format: "feed" | "banner" = "feed", output: Project["style"]["output"] = "instagram"): Project {
  let p = createBlankProject("t", new Date("2026-10-07T00:00:00Z"), { template, format, output });
  for (const [k, v] of Object.entries(FULL)) p = applyEdit(p, { type: "content", field: k as keyof EventContent, value: v! });
  return { ...p, logos: { background: "paper", partners: [{ id: "p0", source: { kind: "builtin", id: "nike" } }] } };
}
const images = (p: Project, withPhoto: boolean): TemplateImages => ({ photo: withPhoto ? photo : { state: "empty" }, sis: SIS_DRAWABLE, partners: p.logos.partners.map((x) => ({ id: x.id, slot: { state: "ready", image: { url: "/nike.png", width: 400, height: 150 } } })) });
function render(p: Project, withPhoto = true, mode: "editor" | "export" = "export") {
  const C = rendererFor(p).Component!;
  return renderToStaticMarkup(<C project={p} images={images(p, withPhoto)} mode={mode} />);
}
const colourVar = (k: TextColourChoice) => color(TEXT_COLOURS[k].token!);

/** role → the colour of every element carrying that role, from the markup. */
function roleColours(html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of html.matchAll(/<[a-z0-9]+\b([^>]*?)data-text-role="([a-z-]+)"([^>]*)>/g)) {
    const attrs = m[1]! + m[3]!;
    const c = attrs.match(/style="[^"]*?(?:^|;|")color:([^;"]+)/) ?? attrs.match(/[;"]color:([^;"]+)/);
    (out[m[2]!] ??= []).push(c ? c[1]! : "?");
  }
  return out;
}

const ALL_ROLES: TextRole[] = ["headline", "subheader", "date", "day", "time", "venue", "date-label", "time-label", "venue-label", "city", "notes"];

describe("model", () => {
  it("Auto is the default: no project has text colours until someone picks one", () => {
    expect(createBlankProject("x").textColours).toBeUndefined();
  });

  it("only approved brand colours exist; no free RGB/HEX", () => {
    const tokens = Object.values(TEXT_COLOURS).map((t) => t.token).filter(Boolean);
    for (const t of tokens) expect(COLORS[t!]).toMatch(/^#[0-9A-F]{6}$/i);
    expect(Object.keys(TEXT_COLOURS)).toEqual(["auto", "ink", "off-white", "coral", "teal", "royal-blue", "golden"]);
  });

  it("sets, changes and resets one block at a time", () => {
    let p = project("block");
    p = applyEdit(p, { type: "text-colour", role: "headline", colour: "coral" });
    p = applyEdit(p, { type: "text-colour", role: "venue", colour: "off-white" });
    expect(p.textColours).toEqual({ headline: "coral", venue: "off-white" });
    p = applyEdit(p, { type: "text-colour", role: "headline", colour: "teal" });
    expect(p.textColours).toEqual({ headline: "teal", venue: "off-white" });
    p = applyEdit(p, { type: "text-colour", role: "headline", colour: "auto" });
    expect(p.textColours).toEqual({ venue: "off-white" });
    expect(applyEdit(p, { type: "reset-text-colours" }).textColours).toEqual({});
    expect(applyEdit(p, { type: "reset-to-auto" }).textColours).toEqual({});
  });

  it("the paint resolver falls back to the template colour and never shares state between roles", () => {
    const paint = makePaint({ textColours: { headline: "coral" } });
    expect(paint.color("headline", "TEMPLATE")).toBe(color("coral"));
    for (const r of ALL_ROLES.filter((x) => x !== "headline")) expect(paint.color(r, "TEMPLATE")).toBe("TEMPLATE");
    expect(paint.attrs("headline")).toEqual({ "data-text-role": "headline", "data-text-override": "true" });
    expect(paint.attrs("venue")).toEqual({ "data-text-role": "venue" });
  });
});

describe("every template and the Website Banner", () => {
  const cases = [
    ...IDS.flatMap((t) => (["feed", "banner"] as const).flatMap((f) => [true, false].map((withPhoto) => ({ name: `${t} ${f} ${withPhoto ? "photo" : "no photo"}`, p: project(t, f), withPhoto })))),
    { name: "website banner", p: project("block", "banner", "website-banner"), withPhoto: true },
  ];

  it("with no overrides, the markup is exactly what it was (template defaults untouched)", () => {
    for (const c of cases) {
      const html = render(c.p, c.withPhoto);
      expect(html, c.name).not.toContain("data-text-override");
      expect(render({ ...c.p, textColours: {} }, c.withPhoto), c.name).toBe(html);
    }
  });

  it("marks every text block it draws with its role", () => {
    for (const c of cases) {
      const roles = Object.keys(roleColours(render(c.p, c.withPhoto)));
      const declared = c.p.style.output === "website-banner" ? BANNER_TEXT_ROLES : TEMPLATE_TEXT_ROLES[c.p.style.template];
      expect(new Set(roles), c.name).toEqual(new Set(declared));
    }
  });

  it("one override changes only that block (no cross-contamination), for every role", () => {
    for (const c of cases) {
      const base = roleColours(render(c.p, c.withPhoto));
      for (const role of Object.keys(base) as TextRole[]) {
        // A colour that differs from this block's default.
        const pick: TextColourChoice = base[role]!.every((x) => x === colourVar("teal")) ? "golden" : "teal";
        const changed = roleColours(render(applyEdit(c.p, { type: "text-colour", role, colour: pick }), c.withPhoto));
        expect(changed[role]!.every((x) => x === colourVar(pick)), `${c.name}: ${role}`).toBe(true);
        for (const other of Object.keys(base)) if (other !== role) expect(changed[other], `${c.name}: ${role} leaked into ${other}`).toEqual(base[other]);
      }
    }
  });

  it("several overrides at once each keep their own colour; Auto restores the default exactly", () => {
    const pick: Partial<Record<TextRole, TextColourChoice>> = { headline: "coral", date: "teal", day: "golden", time: "royal-blue", venue: "off-white", "date-label": "ink", "venue-label": "golden", city: "teal", notes: "coral", subheader: "royal-blue" };
    for (const c of cases) {
      let p = c.p;
      for (const [role, k] of Object.entries(pick)) p = applyEdit(p, { type: "text-colour", role: role as TextRole, colour: k! });
      const got = roleColours(render(p, c.withPhoto));
      for (const role of Object.keys(got) as TextRole[]) {
        if (pick[role]) expect(got[role]!.every((x) => x === colourVar(pick[role]!)), `${c.name}: ${role}`).toBe(true);
      }
      expect(render(applyEdit(p, { type: "reset-text-colours" }), c.withPhoto), c.name).toBe(render(c.p, c.withPhoto));
    }
  });

  it("date and day are separate blocks even when written on one line", () => {
    const p = applyEdit(project("block"), { type: "text-colour", role: "day", colour: "coral" });
    const html = render(p);
    expect(html).toMatch(new RegExp(`data-text-role="day"[^>]*style="color:${colourVar("coral").replace(/[()]/g, "\\$&")}"`));
    expect(roleColours(html).date).toEqual(roleColours(render(project("block"))).date);
    expect(html.replace(/<[^>]+>/g, "")).toContain("12th October, Sunday");
  });

  it("the Website Banner colours labels and values independently, and the arc stays coral", () => {
    let p = project("block", "banner", "website-banner");
    p = applyEdit(p, { type: "text-colour", role: "venue-label", colour: "off-white" });
    p = applyEdit(p, { type: "text-colour", role: "time", colour: "royal-blue" });
    const got = roleColours(render(p));
    expect(got["venue-label"]).toEqual([colourVar("off-white")]);
    expect(got.venue).toEqual([color("ink")]);
    expect(got.time).toEqual([colourVar("royal-blue")]);
    expect(got["time-label"]).toEqual([color("ink")]);
    expect(render(p)).toContain(`fill="${COLORS.coral}"`);
  });

  it("the export renders the same colours as the editor", () => {
    const p = applyEdit(applyEdit(project("slab"), { type: "text-colour", role: "headline", colour: "golden" }), { type: "text-colour", role: "venue-label", colour: "teal" });
    expect(roleColours(render(p, true, "export"))).toEqual(roleColours(render(p, true, "editor")));
  });
});

describe("switching keeps overrides", () => {
  it("template switching: the same semantic blocks keep their colours in every template", () => {
    let p = applyEdit(project("block"), { type: "text-colour", role: "headline", colour: "teal" });
    p = applyEdit(p, { type: "text-colour", role: "venue", colour: "coral" });
    for (const t of IDS) {
      p = applyEdit(p, { type: "style", style: { template: t } });
      const got = roleColours(render(p));
      expect(got.headline, t).toEqual([colourVar("teal")]);
      expect(got.venue, t).toEqual([colourVar("coral")]);
    }
  });

  it("output switching: the Banner uses them, the Listing draws no text, and Instagram gets them back", () => {
    let p = applyEdit(project("poster"), { type: "text-colour", role: "headline", colour: "golden" });
    p = applyEdit(p, { type: "output", output: "website-banner" });
    expect(roleColours(render(p)).headline).toEqual([colourVar("golden")]);
    p = applyEdit(p, { type: "output", output: "website-listing" });
    expect(render(p)).not.toContain("data-text-role");
    expect(textRolesFor(p)).toEqual([]);
    p = applyEdit(p, { type: "output", output: "instagram" });
    expect(roleColours(render(p)).headline).toEqual([colourVar("golden")]);
  });

  it("only shows controls for text the creative actually has", () => {
    const blank = createBlankProject("b", new Date(), { template: "block" });
    expect(textRolesFor(blank)).toEqual([]);
    const headlineOnly = applyEdit(blank, { type: "content", field: "headline", value: "Run" });
    expect(textRolesFor(headlineOnly)).toEqual(["headline"]);
    expect(textRolesFor(project("poster"))).not.toContain("date-label"); // Inline has no labels
    expect(textRolesFor(project("slab"))).toContain("venue-label"); // Rows have labels
    expect(textRolesFor(project("block", "banner", "website-banner"))).not.toContain("notes");
  });
});

describe("persistence", () => {
  it("a saved local draft keeps every override", async () => {
    const db = await openDatabase("tc", new IDBFactory());
    const store = new IndexedDbProjectStore(db);
    const p = { ...project("ticket"), textColours: { headline: "coral" as const, "time-label": "teal" as const, day: "golden" as const } };
    await store.saveProject(p);
    expect((await store.loadProject(p.id))?.textColours).toEqual(p.textColours);
  });

  it("the shared Creative Library brings every override back exactly", async () => {
    const db = await openDatabase("tc2", new IDBFactory());
    const lib = new CreativeLibrary({ backend: new MemoryLibraryBackend(), assets: new MemorySharedAssets(), blobs: new IndexedDbBlobStore(db) });
    const p = { ...project("broadsheet"), textColours: { headline: "royal-blue" as const, venue: "golden" as const, city: "coral" as const } };
    const saved = await lib.saveNew(p);
    const opened = await lib.open(saved.id);
    expect(opened.project.textColours).toEqual(p.textColours);
    expect(render(opened.project)).toBe(render({ ...p, library: opened.project.library }));
  });
});

describe("contrast warning (advisory)", () => {
  it("measures WCAG contrast from real CSS colours", () => {
    expect(ratioOf(parseColor("rgb(17, 4, 5)")!, parseColor("rgb(250, 240, 228)")!)).toBeGreaterThan(15);
    expect(ratioOf(parseColor(COLORS.coral)!, parseColor(COLORS.coral)!)).toBeCloseTo(1, 5);
    expect(parseColor("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3, 0.5]);
  });

  it("warns for a chosen colour that reads poorly on its ground, names the fix, never blocks download", () => {
    const p = applyEdit(project("block"), { type: "text-colour", role: "headline", colour: "coral" });
    const readings: ContrastReading[] = [{ role: "headline", ratio: 1, ground: "light" }];
    const issues = reviewProject(p, images(p, true), { status: "fits", step: 0 }, readings);
    const w = issues.find((i) => i.id === "contrast-headline")!;
    expect(w.level).toBe("warning");
    expect(w.message).toMatch(/^Event title may have low contrast against this background \(1\.0:1\)\. Consider Ink/);
    expect(exportReadiness(issues, images(p, true)).ok).toBe(true);
    expect(p.textColours?.headline).toBe("coral"); // never changed for you
  });

  it("suggests Paper on a dark ground, and stays quiet for good contrast or Auto blocks", () => {
    const p = applyEdit(project("poster"), { type: "text-colour", role: "venue", colour: "ink" });
    expect(contrastWarnings(p, [{ role: "venue", ratio: 1.2, ground: "dark" }])[0]!.message).toMatch(/Consider Paper/);
    expect(contrastWarnings(p, [{ role: "venue", ratio: MIN_TEXT_CONTRAST + 0.1, ground: "dark" }])).toEqual([]);
    expect(contrastWarnings(p, [{ role: "headline", ratio: 1, ground: "dark" }])).toEqual([]); // headline is Auto
  });
});
