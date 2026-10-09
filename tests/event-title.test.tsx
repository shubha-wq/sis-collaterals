import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { ContentSection } from "@/editor/sections/ContentSection";
import { balanceTitle, isConnector } from "@/layout/titleBreaks";
import { MemoryLibraryBackend, MemorySharedAssets } from "@/library/memory";
import { CreativeLibrary } from "@/library/service";
import { createBlankProject, normalizeProject } from "@/model/blank";
import type { Project, TemplateId } from "@/model/project";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { applyEdit } from "@/state/edits";
import { rendererFor } from "@/templates/outputs";
import { TEMPLATES } from "@/templates/registry";
import { FEWER_LINES_MIN, HEADLINE_FLOOR, ONE_LINE_MIN, makeLadder, makeTypeOnlyLadder } from "@/templates/shared/kit";
import { reviewProject } from "@/validation/projectChecks";

/**
 * Event title fitting. The line-breaking rules are pure and tested here
 * with measured widths; the DOM fitting (shrink before wrap, title area,
 * never over the photo, balanced lines, cannot-fit only at the end) is
 * measured on every template and composition by /qa/templates
 * (title-* fixtures) and the Website Banner by /qa/web.
 */

const W = (s: string, perChar = 10) => s.length * perChar;
const line = (text: string) => {
  const words = text.split(" ");
  return { words: words.map((w) => W(w)), connectors: words.map(isConnector) };
};
/** Renders the break result back into text lines, to read the tests easily. */
function lines(text: string[], width: number, gap = 10): string[] | null {
  const typed = text.map(line);
  const r = balanceTitle(typed, gap, width);
  if (!r) return null;
  return text.flatMap((t, i) => {
    const words = t.split(" ");
    const cuts = [0, ...r.breaks[i]!, words.length];
    return cuts.slice(0, -1).map((c, j) => words.slice(c, cuts[j + 1]).join(" "));
  });
}

describe("line breaking (pure)", () => {
  it("keeps a title that fits on one line", () => {
    expect(lines(["Saturday Morning Run"], 400)).toEqual(["Saturday Morning Run"]);
  });

  it("wraps into the fewest lines, balanced rather than greedy", () => {
    // Greedy would give "Community Strength" / "Session"; balanced keeps the widest line shorter.
    expect(lines(["Community Strength Session"], 250, 10)).toEqual(["Community", "Strength Session"]);
  });

  it("never leaves a connector (x, &, and, in…) at the end of a line when it can move down", () => {
    for (const t of ["Sisters in Sweat x Nike Badminton Social", "Strength & Conditioning", "Run and Breakfast Club Social"]) {
      for (const width of [160, 200, 260, 320]) {
        const out = lines([t], width);
        if (!out) continue;
        for (const l of out.slice(0, -1)) expect(isConnector(l.split(" ").at(-1)!), `${t} @${width}: "${l}"`).toBe(false);
      }
    }
  });

  it("never strands a connector alone on a line", () => {
    // At 120 "& Conditioning" doesn't fit, so "&" stays at the end of the line above.
    expect(lines(["Strength & Conditioning"], 120)).toEqual(["Strength &", "Conditioning"]);
  });

  it("avoids a tiny orphan word on the last line", () => {
    const out = lines(["Sisters in Sweat Community Run Social"], 280)!;
    const widths = out.map((l) => W(l));
    expect(Math.min(...widths)).toBeGreaterThan(0.45 * Math.max(...widths));
  });

  it("keeps typed line breaks and balances within each typed line", () => {
    expect(lines(["Sweat Fest", "2026"], 500)).toEqual(["Sweat Fest", "2026"]);
    const out = lines(["Sisters in Sweat Annual", "Sweat Fest 2026"], 160)!;
    expect(out.slice(-1)[0]).toContain("2026");
    expect(out.join(" ")).toBe("Sisters in Sweat Annual Sweat Fest 2026");
  });

  it("an extremely long title uses more lines but never splits a word", () => {
    const t = "The Annual Sisters in Sweat Bangalore Community Fitness Festival with Running Yoga Pilates and Breakfast";
    const out = lines([t], 300)!;
    expect(out.length).toBeGreaterThan(3);
    expect(out.join(" ")).toBe(t);
  });

  it("reports when a single word is wider than the column (the caller sizes down first)", () => {
    expect(lines(["Supercalifragilisticexpialidocious"], 200)).toBeNull();
  });
});

const photo = { state: "ready" as const, image: { url: "/p.jpg", width: 1600, height: 1066 } };
function render(p: Project, withPhoto = true) {
  const C = rendererFor(p).Component!;
  return renderToStaticMarkup(<C project={p} images={{ photo: withPhoto ? photo : { state: "empty" }, sis: SIS_DRAWABLE, partners: [] }} mode="export" />);
}
const titled = (template: TemplateId, format: "feed" | "banner", title: string, output: Project["style"]["output"] = "instagram") =>
  applyEdit(createBlankProject("t", new Date(), { template, format, output }), { type: "content", field: "headline", value: title });
const attr = (html: string, name: string) => html.match(new RegExp(`data-slot="headline"[^>]*${name}="([^"]+)"`))?.[1];

describe("title markup and area", () => {
  it("every template and the Website Banner give the title an area (max height, max lines)", () => {
    for (const t of TEMPLATES.map((x) => x.id)) {
      for (const f of ["feed", "banner"] as const) {
        const html = render(titled(t, f, "Saturday Morning Run"));
        const H = f === "feed" ? 1350 : 1000;
        expect(Number(attr(html, "data-title-max")), `${t} ${f}`).toBeGreaterThan(0.2 * H);
        expect(Number(attr(html, "data-title-max")), `${t} ${f}`).toBeLessThanOrEqual(0.5 * H);
        expect(Number(attr(html, "data-max-lines"))).toBeGreaterThanOrEqual(3);
      }
    }
    const banner = render(titled("block", "banner", "Saturday Morning Run", "website-banner"));
    expect(Number(attr(banner, "data-title-max"))).toBeGreaterThan(0);
  });

  it("type-only compositions allow a taller title than photo ones", () => {
    const withPhoto = Number(attr(render(titled("block", "feed", "Run")), "data-title-max"));
    const typeOnly = Number(attr(render(titled("block", "feed", "Run"), false), "data-title-max"));
    expect(typeOnly).toBeGreaterThan(withPhoto);
  });

  it("words are separate spans with breakable gaps; typed lines stay separate; nothing is truncated", () => {
    const html = render(titled("poster", "feed", "Sweat Fest\n2026 Edition"));
    expect(html.match(/class="tpl-headline-line"/g)).toHaveLength(2);
    expect(html.match(/data-word="true"/g)).toHaveLength(4);
    expect(html).not.toMatch(/text-overflow|…|\.\.\./);
    expect(html.replace(/<[^>]+>/g, "")).toContain("Sweat Fest2026 Edition".replace("Fest2026", "Fest2026"));
  });

  it("allows as many lines as the person typed", () => {
    const six = Array.from({ length: 6 }, (_, i) => `Line ${i + 1}`).join("\n");
    expect(Number(attr(render(titled("slab", "feed", six)), "data-max-lines"))).toBe(6);
  });

  it("switching template or Feed/Banner keeps the title and re-derives its area", () => {
    let p = titled("block", "feed", "Sisters in Sweat x Nike Badminton Social");
    const seen = new Set<string>();
    for (const t of TEMPLATES.map((x) => x.id)) {
      for (const f of ["feed", "banner"] as const) {
        p = applyEdit(p, { type: "style", style: { template: t, format: f } });
        const html = render(p);
        expect(html.replace(/<[^>]+>/g, "")).toContain("Sisters in Sweat x Nike Badminton Social");
        seen.add(attr(html, "data-title-max")!);
      }
    }
    expect(seen.size).toBeGreaterThan(1); // template- and format-specific areas
  });
});

describe("fit order", () => {
  it("shrink-to-one-line and save-a-line limits are modest and above the floor", () => {
    expect(ONE_LINE_MIN).toBeGreaterThan(HEADLINE_FLOOR);
    expect(ONE_LINE_MIN).toBeLessThan(1);
    expect(FEWER_LINES_MIN).toBeGreaterThan(ONE_LINE_MIN);
  });

  it("the ladder tightens spacing, then steps the title down, and tightens leading only at the very end; every rung resets leading", () => {
    for (const ladder of [makeLadder([{}]), makeLadder([{ "--x": "1" }, { "--x": "2" }]), makeTypeOnlyLadder()]) {
      for (const step of ladder) expect(step.vars?.["--hlh"]).toBeDefined();
      const firstSmaller = ladder.findIndex((s) => s.headline < 1);
      const firstTight = ladder.findIndex((s) => s.vars?.["--hlh"] !== "1");
      expect(ladder.slice(0, firstSmaller).some((s) => s.spacing < 1)).toBe(true);
      expect(firstTight).toBeGreaterThan(firstSmaller);
      expect(ladder.at(-1)!.headline).toBeLessThan(1);
    }
  });
});

describe("Event title naming and compatibility", () => {
  it("the editor calls it Event title; the review asks for an event title", () => {
    const p = createBlankProject("x");
    const html = renderToStaticMarkup(<ContentSection project={p} edit={() => {}} open onToggle={() => {}} />);
    expect(html).toContain(">Event title<");
    expect(html).not.toMatch(/>Headline<|Event or session name/);
    expect(reviewProject(p, { photo: { state: "empty" }, sis: SIS_DRAWABLE, partners: [] }, null).find((i) => i.id === "headline")!.message).toBe("Add an event title.");
  });

  it("older drafts and library creatives keep their title (same model field)", async () => {
    const old = { ...createBlankProject("old"), content: { ...createBlankProject("old").content, headline: "Badminton Social" } } as Project;
    expect(normalizeProject(old).content.headline).toBe("Badminton Social");
    const db = await openDatabase("et", new IDBFactory());
    const lib = new CreativeLibrary({ backend: new MemoryLibraryBackend(), assets: new MemorySharedAssets(), blobs: new IndexedDbBlobStore(db) });
    const saved = await lib.saveNew(applyEdit(createBlankProject("x", new Date(), { template: "ticket" }), { type: "content", field: "headline", value: "Sweat Fest\n2026" }));
    const opened = await lib.open(saved.id);
    expect(opened.project.content.headline).toBe("Sweat Fest\n2026");
    expect(render(opened.project)).toBe(render({ ...saved, library: opened.project.library }));
  });
});
