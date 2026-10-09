import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { exportReadiness } from "@/export/gate";
import { libraryEnv } from "@/library/connect";
import { EMPTY_FILTERS, citiesIn, filterCreatives, groupByDay, rangeStart, type LibraryFilters } from "@/library/filter";
import { MemoryLibraryBackend, MemorySharedAssets } from "@/library/memory";
import { CreativeLibrary, fieldsFor, uploadsIn } from "@/library/service";
import { SupabaseLibraryBackend, fieldsToRow, rowToSummary, type CreativeRow } from "@/library/supabase";
import { LibraryError, type CreativeSummary } from "@/library/types";
import type { ImageSource } from "@/model/assets";
import { createBlankProject } from "@/model/blank";
import type { EventContent, Project } from "@/model/project";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { IndexedDbProjectStore, IndexedDbSessionStore } from "@/persistence/indexedDbProjectStore";
import { applyEdit } from "@/state/edits";
import { SessionController } from "@/state/sessionController";
import type { TemplateImages } from "@/templates/types";
import { reviewProject } from "@/validation/projectChecks";

/**
 * The shared Creative Library. "Teammates" are separate browsers (each its
 * own IndexedDB) sharing one library backend and one team asset store, the
 * way the Supabase deployment works. The Supabase adapter's mapping and
 * error handling are tested against a stub client.
 */

const OCT10 = new Date("2026-10-10T09:00:00Z");
const OCT18 = new Date("2026-10-18T11:00:00Z");

async function browser() {
  const db = await openDatabase("sis-collaterals", new IDBFactory());
  return { blobs: new IndexedDbBlobStore(db), projects: new IndexedDbProjectStore(db), session: new IndexedDbSessionStore(db) };
}

function team(clock: { now: Date }) {
  let n = 0;
  return {
    backend: new MemoryLibraryBackend(() => clock.now, () => "ana@sis.test"),
    assets: new MemorySharedAssets(),
    newId: () => `lib-${++n}`,
  };
}

function libraryFor(t: ReturnType<typeof team>, b: Awaited<ReturnType<typeof browser>>, clock: { now: Date }) {
  return new CreativeLibrary({ backend: t.backend, assets: t.assets, blobs: b.blobs, now: () => clock.now, newId: t.newId });
}

const photoFile = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/jpeg" });
const logoFile = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" });

/** A real creative from browser A: uploaded photo and logo, colours, framing, plates. */
async function oct10Creative(b: Awaited<ReturnType<typeof browser>>): Promise<Project> {
  const photoId = await b.blobs.put(photoFile);
  const logoId = await b.blobs.put(logoFile);
  let p = createBlankProject("proj-oct10", OCT10, { template: "broadsheet" });
  const content: Partial<EventContent> = { headline: "Sweat Session", date: "12th October", day: "Sunday", time: "7 AM", venue: "Indiranagar", city: "Bangalore", notes: "Bring water" };
  for (const [field, value] of Object.entries(content)) p = applyEdit(p, { type: "content", field: field as keyof EventContent, value: value! });
  p = applyEdit(p, { type: "photo", source: { kind: "upload", blobId: photoId, libraryId: "ph1", name: "Court" } });
  p = applyEdit(p, { type: "photo-framing", focusX: 30, focusY: 70, zoom: 1.4 });
  p = applyEdit(p, { type: "add-partner", logo: { id: "p1", source: { kind: "upload", blobId: logoId, libraryId: "lg1", name: "Hive Club" } } });
  p = applyEdit(p, { type: "add-partner", logo: { id: "p2", source: { kind: "builtin", id: "nike" } } });
  p = applyEdit(p, { type: "logo-background", background: "paper" });
  p = applyEdit(p, { type: "style", style: { accent: "teal" } });
  p = applyEdit(p, { type: "overrides", overrides: { paperGround: "tint", logoScale: 1.2, headlineSize: "large" } });
  p = applyEdit(p, { type: "text-colour", role: "headline", colour: "coral" });
  p = applyEdit(p, { type: "text-colour", role: "venue", colour: "royal-blue" });
  p = applyEdit(p, { type: "web-framing", output: "website-banner", fill: "fit", focusX: 10 });
  return p;
}

const strip = (p: Project) => {
  const { library: _l, updatedAt: _u, ...rest } = p;
  return rest;
};

describe("Creative Library: save and reopen exactly", () => {
  it("stores the structured project (not an image) with list fields, and reopens it identically in another browser", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const libA = libraryFor(t, a, clock);
    const original = await oct10Creative(a);
    const saved = await libA.saveNew(original, new Blob(["jpeg"], { type: "image/jpeg" }));

    expect(saved.id).toBe("proj-oct10");
    expect(saved.library).toEqual({ version: 1, savedAt: OCT10.toISOString() });
    const record = (await t.backend.get(saved.id))!;
    expect(record.project.library).toBeUndefined(); // the link isn't stored inside the project
    expect(record).toMatchObject({ output: "instagram", template: "broadsheet", headline: "Sweat Session", eventDate: "12th October", eventDay: "Sunday", city: "Bangalore", venue: "Indiranagar", version: 1, createdBy: "ana@sis.test" });
    expect(record.thumbnailPath).toMatch(/^thumbs\/proj-oct10\//);
    expect(typeof record.project.content.headline).toBe("string"); // structured data

    // Teammate B, a different browser with none of the files.
    clock.now = OCT18;
    const b = await browser();
    const libB = libraryFor(t, b, clock);
    const opened = await libB.open(saved.id);
    expect(opened.missing).toEqual([]);
    expect(strip(opened.project)).toEqual(strip(original));
    expect(opened.project.library).toEqual({ version: 1, savedAt: OCT10.toISOString() });
    // Every setting survives: output, template, photo + framing, logos + plates, colours, overrides, text colours.
    expect(opened.project.style).toEqual(original.style);
    expect(opened.project.photo).toEqual(original.photo);
    expect(opened.project.logos).toEqual(original.logos);
    expect(opened.project.overrides).toEqual(original.overrides);
    expect(opened.project.textColours).toEqual({ headline: "coral", venue: "royal-blue" });
    // The files came with it.
    for (const s of uploadsIn(original)) expect(await b.blobs.has(s.blobId)).toBe(true);
  });

  it("the 18 October edit: open the 10 October creative, change the venue, Save changes", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const v1 = await libraryFor(t, a, clock).saveNew(await oct10Creative(a));

    clock.now = OCT18;
    const b = await browser();
    const libB = libraryFor(t, b, clock);
    const { project } = await libB.open(v1.id);
    const edited = applyEdit(project, { type: "content", field: "venue", value: "HSR" });
    const v2 = await libB.saveChanges(edited);

    expect(v2.id).toBe(v1.id);
    expect(v2.library).toEqual({ version: 2, savedAt: OCT18.toISOString() });
    const list = await t.backend.list({});
    expect(list).toHaveLength(1); // updated, not duplicated
    expect(list[0]).toMatchObject({ venue: "HSR", version: 2, createdAt: OCT10.toISOString(), updatedAt: OCT18.toISOString() });
    // Same photo, template, logos and colours.
    const current = (await t.backend.get(v1.id))!.project;
    expect(current.photo).toEqual(project.photo);
    expect(current.style.template).toBe("broadsheet");
    expect(current.logos).toEqual(project.logos);
    expect(current.textColours).toEqual(project.textColours);
    // The original is recoverable.
    expect(await libB.versions(v1.id)).toEqual([expect.objectContaining({ version: 1, savedAt: OCT10.toISOString() })]);
    expect((await t.backend.getVersion(v1.id, 1))!.content.venue).toBe("Indiranagar");
    const old = await libB.open(v1.id, 1);
    expect(old.restoredFrom).toBe(1);
    expect(old.project.content.venue).toBe("Indiranagar");
    expect(old.project.library?.version).toBe(2); // Save changes would make it current, archiving version 2
  });

  it("Save as new keeps the original untouched and creates a separate creative", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const lib = libraryFor(t, a, clock);
    const v1 = await lib.saveNew(await oct10Creative(a));
    clock.now = OCT18;
    const copy = await lib.saveNew(applyEdit(v1, { type: "content", field: "city", value: "Mumbai" }));
    expect(copy.id).not.toBe(v1.id);
    expect(copy.library?.version).toBe(1);
    expect(copy.createdAt).toBe(OCT18.toISOString());
    expect((await t.backend.get(v1.id))!.project.content.city).toBe("Bangalore");
    expect((await t.backend.get(copy.id))!.city).toBe("Mumbai");
    expect(await t.backend.list({})).toHaveLength(2);
    // The shared photo is stored once for both creatives.
    expect(t.assets.blobs.size).toBe(2); // photo + logo
  });

  it("never overwrites someone else's newer save (version check)", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const b = await browser();
    const v1 = await libraryFor(t, a, clock).saveNew(await oct10Creative(a));
    const asA = (await libraryFor(t, a, clock).open(v1.id)).project;
    const asB = (await libraryFor(t, b, clock).open(v1.id)).project;
    await libraryFor(t, a, clock).saveChanges(applyEdit(asA, { type: "content", field: "time", value: "8 AM" }));
    await expect(libraryFor(t, b, clock).saveChanges(applyEdit(asB, { type: "content", field: "time", value: "9 AM" }))).rejects.toMatchObject({ code: "conflict" });
    expect((await t.backend.get(v1.id))!.project.content.time).toBe("8 AM");
    // B keeps their edit by saving as new.
    const mine = await libraryFor(t, b, clock).saveNew(applyEdit(asB, { type: "content", field: "time", value: "9 AM" }));
    expect((await t.backend.get(mine.id))!.project.content.time).toBe("9 AM");
  });

  it("Save changes needs a library creative; a never-saved creative uses Save to Library", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const p = createBlankProject("fresh", OCT10);
    await expect(libraryFor(t, a, clock).saveChanges(p)).rejects.toBeInstanceOf(LibraryError);
  });
});

describe("Creative Library: assets", () => {
  it("refuses to save a creative whose uploaded file can't be shared (nothing is stored)", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const p = applyEdit(createBlankProject("x", OCT10), { type: "photo", source: { kind: "upload", blobId: "f".repeat(64), name: "Lost photo" } });
    const withHeadline = applyEdit(p, { type: "content", field: "headline", value: "Run" });
    await expect(libraryFor(t, a, clock).saveNew(withHeadline)).rejects.toMatchObject({ code: "asset-missing" });
    expect(await t.backend.list({})).toEqual([]);
  });

  it("a file already in team storage is reused, even if this browser lost it", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const v1 = await libraryFor(t, a, clock).saveNew(await oct10Creative(a));
    const b = await browser();
    const { project } = await libraryFor(t, b, clock).open(v1.id);
    const fresh = await browser(); // a browser that has none of the files and never opened it
    const again = await libraryFor(t, fresh, clock).saveNew({ ...project, library: undefined, id: "other" });
    expect(again.id).toBe("other");
    expect(t.assets.blobs.size).toBe(2);
  });

  it("deleting a logo or photo from a personal library never breaks a shared creative", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const v1 = await libraryFor(t, a, clock).saveNew(await oct10Creative(a));
    // Browser A clears its files entirely; the team copy is unaffected.
    await a.blobs.collectGarbage(new Set());
    const reopened = await libraryFor(t, a, clock).open(v1.id);
    expect(reopened.missing).toEqual([]);
    for (const s of uploadsIn(reopened.project)) expect(await a.blobs.has(s.blobId)).toBe(true);
  });

  it("a file missing from team storage opens as a visible 'missing' slot and blocks download, never crashes", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const v1 = await libraryFor(t, a, clock).saveNew(await oct10Creative(a));
    const photoId = (v1.photo.source as Extract<ImageSource, { kind: "upload" }>).blobId;
    t.assets.blobs.delete(photoId); // simulate an out-of-band deletion
    const b = await browser();
    const opened = await libraryFor(t, b, clock).open(v1.id);
    expect(opened.missing).toEqual(["Court"]);
    expect(opened.project.content.headline).toBe("Sweat Session");
    const images: TemplateImages = { photo: { state: "missing", name: "Court" }, sis: SIS_DRAWABLE, partners: [] };
    const issues = reviewProject(opened.project, images, { status: "fits", step: 0 });
    expect(exportReadiness(issues, images).ok).toBe(false);
  });

  it("asset references are content hashes, so the same file is never stored twice", async () => {
    const a = await browser();
    const p = await oct10Creative(a);
    const refs = uploadsIn(p).map((s) => s.blobId);
    expect(refs).toHaveLength(2);
    for (const id of refs) expect(id).toMatch(/^[0-9a-f]{64}$/);
    const dup = applyEdit(p, { type: "photo", source: { kind: "upload", blobId: refs[1]!, name: "Same file" } });
    expect(uploadsIn(dup)).toHaveLength(1);
  });
});

function summary(over: Partial<CreativeSummary>): CreativeSummary {
  return { id: "x", version: 1, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", createdBy: null, updatedBy: null, output: "instagram", template: "block", headline: "", eventDate: "", eventDay: "", city: "", venue: "", thumbnailPath: null, ...over };
}

describe("Creative Library: search and filters", () => {
  const NOW = new Date(2026, 9, 18, 12); // 18 Oct 2026, local
  const day = (d: number, m = 9) => new Date(2026, m, d, 10).toISOString();
  const list = [
    summary({ id: "a", headline: "Sweat Session", city: "Bangalore", venue: "HSR Club", output: "instagram", template: "broadsheet", updatedAt: day(12) }),
    summary({ id: "b", headline: "Run Club", city: "Mumbai", venue: "Bandra Fort", output: "website-banner", template: null, updatedAt: day(10) }),
    summary({ id: "c", headline: "Strength Session", city: "Delhi", venue: "Saket", output: "instagram", template: "poster", updatedAt: day(8) }),
    summary({ id: "d", headline: "Old Yoga", city: "bangalore", venue: "Cubbon Park", output: "website-listing", template: null, updatedAt: day(1, 8) }), // 1 Sep: outside 30 days
  ];
  const f = (over: Partial<LibraryFilters>) => filterCreatives(list, { ...EMPTY_FILTERS, ...over }, NOW).map((c) => c.id);

  it("shows the last 30 days by default, newest first, without anyone doing date maths", () => {
    expect(EMPTY_FILTERS.range).toBe("30d");
    expect(f({})).toEqual(["a", "b", "c"]);
    expect(rangeStart("30d", NOW)).toBe(new Date(2026, 8, 18).toISOString());
  });

  it("keeps older creatives available under a longer range", () => {
    expect(f({ range: "all" })).toEqual(["a", "b", "c", "d"]);
    expect(f({ range: "90d" })).toEqual(["a", "b", "c", "d"]);
    expect(f({ range: "7d" })).toEqual(["a"]); // from 11 Oct
  });

  it("searches headline, venue and city (case and accent insensitive, all words)", () => {
    expect(f({ search: "session" })).toEqual(["a", "c"]);
    expect(f({ search: "hsr" })).toEqual(["a"]);
    expect(f({ search: "MUMBAI" })).toEqual(["b"]);
    expect(f({ search: "strength saket" })).toEqual(["c"]);
    expect(f({ search: "nothing like this" })).toEqual([]);
  });

  it("filters by city, output type and template", () => {
    expect(f({ city: "Bangalore", range: "all" })).toEqual(["a", "d"]);
    expect(f({ output: "website-banner" })).toEqual(["b"]);
    expect(f({ output: "instagram" })).toEqual(["a", "c"]);
    expect(f({ template: "poster" })).toEqual(["c"]);
    expect(f({ template: "broadsheet", city: "Delhi" })).toEqual([]);
    expect(citiesIn(list)).toEqual(["Bangalore", "Delhi", "Mumbai"]);
  });

  it("groups by the day it was saved", () => {
    const g = groupByDay(filterCreatives(list, EMPTY_FILTERS, NOW));
    expect(g.map((x) => x.items.map((c) => c.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("the backend list honours the range too (older records are kept, just not shown)", async () => {
    const clock = { now: new Date("2026-08-01T10:00:00Z") };
    const t = team(clock);
    const a = await browser();
    const lib = libraryFor(t, a, clock);
    await lib.saveNew(applyEdit(createBlankProject("old", clock.now), { type: "content", field: "headline", value: "August" }));
    clock.now = new Date("2026-10-18T10:00:00Z");
    await lib.saveNew(applyEdit(createBlankProject("new", clock.now), { type: "content", field: "headline", value: "October" }));
    expect((await lib.list("30d")).map((c) => c.headline)).toEqual(["October"]);
    expect((await lib.list("all")).map((c) => c.headline)).toEqual(["October", "August"]);
  });
});

describe("Creative Library and the editor session", () => {
  it("an opened library creative behaves like the current creative; edits are 'unsaved changes' until Save changes; never autosaved to the library", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const lib = libraryFor(t, a, clock);
    const v1 = await lib.saveNew(await oct10Creative(a));
    const c = new SessionController({ projects: a.projects, session: a.session, autosaveMs: 1, newId: () => `n-${Math.random()}` });
    await c.start();
    await c.openCreative((await lib.open(v1.id)).project);
    expect(c.getSnapshot().project.content.venue).toBe("Indiranagar");
    expect(c.getSnapshot().draftId).toBeNull();
    expect(c.hasUnsavedWork()).toBe(false);
    c.edit({ type: "content", field: "venue", value: "HSR" });
    expect(c.getSnapshot().libraryDirty).toBe(true);
    expect(c.hasUnsavedWork()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect((await t.backend.get(v1.id))!.version).toBe(1); // nothing autosaved
    const saved = await lib.saveChanges(c.getSnapshot().project);
    await c.librarySaved(saved);
    expect(c.getSnapshot().libraryDirty).toBe(false);
    expect(c.getSnapshot().project.library?.version).toBe(2);
    expect(c.hasUnsavedWork()).toBe(false);
  });

  it("local drafts keep working alongside, and remember the library link", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const lib = libraryFor(t, a, clock);
    const v1 = await lib.saveNew(await oct10Creative(a));
    const c = new SessionController({ projects: a.projects, session: a.session, autosaveMs: 1 });
    await c.start();
    await c.openCreative((await lib.open(v1.id)).project);
    await c.saveDraft();
    const draft = await a.projects.loadProject(v1.id);
    expect(draft?.library?.version).toBe(1);
    expect(draft?.textColours).toEqual({ headline: "coral", venue: "royal-blue" });
  });

  it("after Save as new, the editor holds the new creative and the original's draft is left alone", async () => {
    const clock = { now: OCT10 };
    const t = team(clock);
    const a = await browser();
    const lib = libraryFor(t, a, clock);
    const v1 = await lib.saveNew(await oct10Creative(a));
    const c = new SessionController({ projects: a.projects, session: a.session, autosaveMs: 1 });
    await c.start();
    await c.openCreative((await lib.open(v1.id)).project);
    await c.saveDraft();
    c.edit({ type: "content", field: "city", value: "Pune" });
    const copy = await lib.saveNew(c.getSnapshot().project);
    await c.librarySaved(copy);
    expect(c.getSnapshot().project.id).toBe(copy.id);
    expect(c.getSnapshot().draftId).toBeNull();
    expect((await a.projects.loadProject(v1.id))?.content.city).toBe("Bangalore");
  });
});

describe("Supabase adapter", () => {
  const row: CreativeRow = {
    id: "c1", version: 3, created_at: "2026-10-10T09:00:00+00:00", updated_at: "2026-10-18T11:00:00+00:00", created_by: "ana@sis.test", updated_by: "bo@sis.test",
    output: "website-banner", template: null, headline: "Run", event_date: "1st Nov", event_day: "", city: "Pune", venue: "Track", thumbnail_path: "thumbs/c1/1.jpg",
  };

  it("maps rows and fields both ways", () => {
    expect(rowToSummary(row)).toEqual({
      id: "c1", version: 3, createdAt: "2026-10-10T09:00:00.000Z", updatedAt: "2026-10-18T11:00:00.000Z", createdBy: "ana@sis.test", updatedBy: "bo@sis.test",
      output: "website-banner", template: null, headline: "Run", eventDate: "1st Nov", eventDay: "", city: "Pune", venue: "Track", thumbnailPath: "thumbs/c1/1.jpg",
    });
    const p = createBlankProject("p", OCT10, { template: "slab" });
    expect(fieldsToRow(fieldsFor(p, null))).toEqual({ output: "instagram", template: "slab", headline: "", event_date: "", event_day: "", city: "", venue: "", thumbnail_path: null });
  });

  /** A stub of the few Supabase calls the backend makes. */
  function stub(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "gte", "eq", "insert"]) chain[m] = () => chain;
    chain.single = async () => result;
    chain.maybeSingle = async () => result;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return { from: () => chain, rpc: async () => result } as unknown as ConstructorParameters<typeof SupabaseLibraryBackend>[0];
  }

  it("reports a version conflict when the save function changes nothing", async () => {
    const p = createBlankProject("p", OCT10);
    await expect(new SupabaseLibraryBackend(stub({ data: [], error: null })).update("c1", 1, p, fieldsFor(p, null))).rejects.toMatchObject({ code: "conflict" });
    const ok = await new SupabaseLibraryBackend(stub({ data: [row], error: null })).update("c1", 2, p, fieldsFor(p, null));
    expect(ok.version).toBe(3);
  });

  it("turns a duplicate id into 'exists' and a permissions error into a team-list message", async () => {
    const p = createBlankProject("p", OCT10);
    await expect(new SupabaseLibraryBackend(stub({ error: { code: "23505" } })).insert("c1", p, fieldsFor(p, null))).rejects.toMatchObject({ code: "exists" });
    await expect(new SupabaseLibraryBackend(stub({ error: { code: "42501" } })).insert("c1", p, fieldsFor(p, null))).rejects.toMatchObject({ code: "unauthorised", message: expect.stringMatching(/team list/) });
    await expect(new SupabaseLibraryBackend(stub({ error: { code: "XX000" } })).list({})).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reads credentials only from the environment", () => {
    expect(libraryEnv({})).toBeNull();
    expect(libraryEnv({ VITE_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(libraryEnv({ VITE_SUPABASE_URL: " https://x.supabase.co ", VITE_SUPABASE_ANON_KEY: "anon" })).toEqual({ url: "https://x.supabase.co", key: "anon" });
  });
});
