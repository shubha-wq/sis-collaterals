import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBlankProject } from "@/model/blank";
import { migrateProject } from "@/model/migrate";
import { SCHEMA_VERSION, type Project } from "@/model/project";
import { BackupError, createBackup, restoreBackup } from "@/persistence/backup";
import { DB_NAME, DB_VERSION, STORES, idbGet, idbPut, openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { IndexedDbProjectStore, IndexedDbSessionStore } from "@/persistence/indexedDbProjectStore";
import type { ProjectStore } from "@/persistence/types";
import { SessionController } from "@/state/sessionController";

/**
 * Draft safety: drafts survive reloads, app updates and schema upgrades;
 * nothing is ever replaced by a blank project; unreadable drafts are kept and
 * reported; failed saves are surfaced and retried; project files restore an
 * editable creative with its files; startup never resets storage.
 *
 * A "browser" is one IndexedDB factory; "reload" = a new SessionController
 * (and a fresh database connection) on the same factory.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function browser(factory = new IDBFactory()) {
  const connect = async () => {
    const db = await openDatabase(DB_NAME, factory);
    return { db, blobs: new IndexedDbBlobStore(db), projects: new IndexedDbProjectStore(db), session: new IndexedDbSessionStore(db) };
  };
  let n = 0;
  const launch = async (projects?: ProjectStore) => {
    const s = await connect();
    const c = new SessionController({ projects: projects ?? s.projects, session: s.session, autosaveMs: 5, newId: () => `proj-${++n}-${Math.random().toString(36).slice(2)}` });
    await c.start();
    return { c, ...s };
  };
  return { factory, connect, launch };
}

/** A draft as an early version of the app (schema 1) stored it: no output, no text colours, no website framing, no day/notes fields. */
function v1Draft(id = "old-1"): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name: "",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T11:00:00.000Z",
    content: { headline: "Saturday Morning Run", subheader: "", date: "6th September", time: "7 AM", venue: "Cubbon Park", city: "Bangalore" },
    photo: { source: { kind: "builtin", id: "run-cubbon-park" }, focusX: 40, focusY: 60, zoom: 1.2 },
    logos: { partners: [{ id: "n", source: { kind: "builtin", id: "nike" } }], background: "paper" },
    style: { template: "broadsheet", format: "banner", accent: "teal", detailStyle: "auto" },
    overrides: { headlineSize: "large" },
    aFieldFromTheFuture: { keep: true },
  };
}

describe("drafts survive reloads and app updates", () => {
  it("a saved draft reopens after a reload, with its photo and logo files", async () => {
    const b = await browser();
    const first = await b.launch();
    const photoId = await first.blobs.put(new Blob(["PHOTO"], { type: "image/jpeg" }));
    const logoId = await first.blobs.put(new Blob(["<svg/>"], { type: "image/svg+xml" }));
    first.c.edit({ type: "content", field: "headline", value: "Badminton Social" });
    first.c.edit({ type: "photo", source: { kind: "upload", blobId: photoId, name: "Court" } });
    first.c.edit({ type: "add-partner", logo: { id: "h", source: { kind: "upload", blobId: logoId, name: "Hive" } } });
    await first.c.saveDraft();
    first.c.edit({ type: "content", field: "venue", value: "HSR Club" });
    await wait(30); // autosave debounce
    first.db.close();

    const again = await b.launch(); // reload / reopen the tab
    const p = again.c.getSnapshot().project;
    expect(again.c.getSnapshot().draftId).toBe(p.id);
    expect(again.c.getSnapshot().status).toBe("saved");
    expect(p.content).toMatchObject({ headline: "Badminton Social", venue: "HSR Club" });
    expect(await (await again.blobs.get(photoId))!.text()).toBe("PHOTO");
    expect(await (await again.blobs.get(logoId))!.text()).toBe("<svg/>");
  });

  it("an existing draft survives a schema upgrade: opens with safe defaults and keeps every field", async () => {
    const b = await browser();
    const s = await b.connect();
    await idbPut(s.db, STORES.projects, v1Draft());
    await s.session.setLastOpenedDraft("old-1");
    s.db.close();

    const { c, db } = await b.launch();
    const p = c.getSnapshot().project;
    expect(c.getSnapshot().draftId).toBe("old-1");
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    // Existing data kept…
    expect(p.content.headline).toBe("Saturday Morning Run");
    expect(p.photo).toMatchObject({ focusX: 40, focusY: 60, zoom: 1.2 });
    expect(p.logos.background).toBe("paper");
    expect(p.style).toMatchObject({ template: "broadsheet", accent: "teal" });
    expect(p.overrides).toEqual({ headlineSize: "large" });
    // …and new fields get safe defaults.
    expect(p.content.day).toBe("");
    expect(p.content.notes).toBe("");
    expect(p.style.output).toBe("instagram");
    expect(p.style.format).toBe("feed");
    // Reading never rewrites the stored record.
    expect(await idbGet(db, STORES.projects, "old-1")).toEqual(v1Draft());
    // Editing saves the upgraded draft, keeping fields this version doesn't know.
    c.edit({ type: "content", field: "venue", value: "Lalbagh" });
    await wait(30);
    const stored = (await idbGet<Record<string, unknown>>(db, STORES.projects, "old-1"))!;
    expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stored.aFieldFromTheFuture).toEqual({ keep: true });
    expect((stored.content as Record<string, string>).venue).toBe("Lalbagh");
  });

  it("new fields get safe defaults even from damaged or partial records", () => {
    const r = migrateProject({ id: "x", content: { headline: 42 }, photo: { focusX: "a", zoom: 99 }, logos: { partners: [{}, { id: "ok", source: { kind: "builtin", id: "nike" } }], background: "neon" }, style: { template: "unknown" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.content.headline).toBe("");
    expect(r.project.photo).toMatchObject({ source: null, focusX: 50, zoom: 2.5 });
    expect(r.project.logos).toEqual({ partners: [{ id: "ok", source: { kind: "builtin", id: "nike" } }], background: "none" });
    expect(r.project.style.template).toBe("block");
    expect(r.project.overrides).toEqual({});
  });

  it("a draft from a newer app version, or an unreadable one, is kept untouched and reported (recovery), never replaced", async () => {
    const b = await browser();
    const s = await b.connect();
    const future = { ...v1Draft("future-1"), schemaVersion: SCHEMA_VERSION + 1 };
    await idbPut(s.db, STORES.projects, future);
    const broken = { id: "broken-1", schemaVersion: SCHEMA_VERSION + 7, content: "garbled" };
    await idbPut(s.db, STORES.projects, broken);
    await s.session.setLastOpenedDraft("future-1");
    s.db.close();

    const { c, db, projects } = await b.launch();
    const v = c.getSnapshot();
    expect(v.recovery).toMatchObject({ draftId: "future-1", reason: expect.stringMatching(/newer version/) });
    expect(v.draftId).toBeNull(); // the blank editor isn't attached to that draft…
    c.edit({ type: "content", field: "headline", value: "Something else" });
    await wait(30);
    expect(await idbGet(db, STORES.projects, "future-1")).toEqual(future); // …so it can't overwrite it
    // The drafts list still works and marks the broken records.
    const list = await projects.listProjects();
    expect(list.map((d) => d.id).sort()).toEqual(["broken-1", "future-1"]);
    expect(list.every((d) => d.needsRecovery)).toBe(true);
    expect(await c.openDraft("broken-1")).toBe(false);
    expect(c.getSnapshot().recovery?.draftId).toBe("broken-1");
    expect(await c.rawDraft("broken-1")).toEqual(broken); // recovery copy available
    // Still pointed at it after a reload (only dismissing forgets it); the data is never deleted.
    await c.dismissRecovery();
    expect(await idbGet(db, STORES.projects, "broken-1")).toEqual(broken);
  });

  it("records that aren't creatives are reported, not opened as blank", () => {
    expect(migrateProject(null)).toMatchObject({ ok: false });
    expect(migrateProject("text")).toMatchObject({ ok: false });
    expect(migrateProject({ content: {} })).toMatchObject({ ok: false, reason: expect.stringMatching(/no id/) });
  });

  it("a saved draft is never replaced by a blank project", async () => {
    const b = await browser();
    const first = await b.launch();
    first.c.edit({ type: "content", field: "headline", value: "Keep me" });
    await first.c.saveDraft();
    const id = first.c.getSnapshot().draftId!;
    await first.c.newCreative(); // a blank creative
    first.c.edit({ type: "content", field: "headline", value: "" });
    await wait(30);
    expect((await first.projects.loadProject(id))!.content.headline).toBe("Keep me");
    first.db.close();
    // A launch where the draft can't be read doesn't write a blank over it either (covered above), and a normal launch reopens it.
    const again = await b.launch();
    await again.c.openDraft(id);
    expect(again.c.getSnapshot().project.content.headline).toBe("Keep me");
  });
});

describe("autosave status and failed saves", () => {
  it("shows Saving, then Saved only after the write succeeds; a failed write is surfaced and Retry saves it", async () => {
    const b = await browser();
    const s = await b.connect();
    let fail = 0;
    const flaky: ProjectStore = {
      saveProject: async (p: Project) => {
        if (fail > 0) {
          fail--;
          throw new Error("QuotaExceededError");
        }
        await s.projects.saveProject(p);
      },
      loadProject: (id) => s.projects.loadProject(id),
      loadRawProject: (id) => s.projects.loadRawProject(id),
      deleteProject: (id) => s.projects.deleteProject(id),
      listProjects: () => s.projects.listProjects(),
    };
    const { c } = await b.launch(flaky);
    c.edit({ type: "content", field: "headline", value: "Run Club" });
    await c.saveDraft();
    expect(c.getSnapshot().status).toBe("saved");

    fail = 1;
    c.edit({ type: "content", field: "venue", value: "HSR" });
    expect(c.getSnapshot().status).toBe("saving");
    await wait(30);
    expect(c.getSnapshot().status).toBe("error"); // never "saved" when the write failed
    expect(c.getSnapshot().project.content.venue).toBe("HSR"); // the edit is still here
    expect(c.hasUnsavedWork()).toBe(true); // closing or New creative now warns
    expect((await s.projects.loadProject(c.getSnapshot().draftId!))!.content.venue).toBe("");

    await c.retrySave();
    expect(c.getSnapshot().status).toBe("saved");
    expect((await s.projects.loadProject(c.getSnapshot().draftId!))!.content.venue).toBe("HSR");
    expect(c.hasUnsavedWork()).toBe(false);
  });

  it("warns before leaving unsaved work: a never-saved creative, or a saved one with a pending or failed save", async () => {
    const b = await browser();
    const { c } = await b.launch();
    expect(c.hasUnsavedWork()).toBe(false); // blank
    c.edit({ type: "content", field: "headline", value: "New" });
    expect(c.hasUnsavedWork()).toBe(true); // never saved
    await c.saveDraft();
    expect(c.hasUnsavedWork()).toBe(false);
    c.edit({ type: "content", field: "city", value: "Pune" });
    expect(c.hasUnsavedWork()).toBe(true); // save pending
    await wait(30);
    expect(c.hasUnsavedWork()).toBe(false);
  });
});

describe("project files (editable backups)", () => {
  async function creativeWithFiles(blobs: IndexedDbBlobStore) {
    const photoId = await blobs.put(new Blob(["PORTRAIT-PHOTO-BYTES"], { type: "image/jpeg" }));
    const logoId = await blobs.put(new Blob(["<svg>hive</svg>"], { type: "image/svg+xml" }));
    const landId = await blobs.put(new Blob(["GENERATED-LANDSCAPE"], { type: "image/jpeg" }));
    const p: Project = {
      ...createBlankProject("proj-backup", new Date("2026-10-09T10:00:00Z"), { output: "website-banner", format: "banner" }),
      content: { ...createBlankProject("x").content, headline: "Sweat Fest\n2026", venue: "HSR", city: "Bangalore" },
      photo: {
        source: { kind: "upload", blobId: photoId, name: "Portrait" },
        focusX: 30,
        focusY: 50,
        zoom: 1,
        web: { "website-banner": { fill: "fit", focusX: 10 } },
        expansion: { key: "k", blobId: landId, masterW: 2637, masterH: 1000, photoX: 1038, photoY: 0, photoW: 563, photoH: 1000, provider: "fake", createdAt: "2026-10-09T10:00:00Z" },
      },
      logos: { partners: [{ id: "h", source: { kind: "upload", blobId: logoId, name: "Hive" } }, { id: "n", source: { kind: "builtin", id: "nike" } }], background: "white" },
      textColours: { headline: "coral", venue: "teal" },
      library: { version: 3, savedAt: "2026-10-09T09:00:00Z" },
    };
    return { p, photoId, logoId, landId };
  }

  it("export → import in another browser restores an editable creative with all its files", async () => {
    const a = await browser();
    const sa = await a.connect();
    const { p, photoId, logoId, landId } = await creativeWithFiles(sa.blobs);
    const backup = JSON.parse(JSON.stringify(await createBackup(p, sa.blobs)));
    expect(Object.keys(backup.files).sort()).toEqual([photoId, logoId, landId].sort());
    expect(backup.project.library).toBeUndefined();

    const other = await browser(); // a different browser / computer
    const { c, blobs, projects } = await other.launch();
    const restored = await restoreBackup(backup, { blobs, projects });
    await c.openRestored(restored);
    const v = c.getSnapshot();
    expect(v.draftId).toBe("proj-backup");
    const { library: _l, updatedAt: _u, ...expected } = p;
    const { updatedAt: _u2, ...got } = v.project;
    expect(got).toEqual(expected);
    for (const id of [photoId, logoId, landId]) expect(await blobs.has(id)).toBe(true);
    expect(await (await blobs.get(photoId))!.text()).toBe("PORTRAIT-PHOTO-BYTES");
    // Editable: edits autosave to the restored draft.
    c.edit({ type: "content", field: "venue", value: "Koramangala" });
    await wait(30);
    expect((await projects.loadProject("proj-backup"))!.content.venue).toBe("Koramangala");
  });

  it("never overwrites an existing draft: a backup with the same id is restored as a copy", async () => {
    const b = await browser();
    const s = await b.connect();
    const { p } = await creativeWithFiles(s.blobs);
    await s.projects.saveProject({ ...p, content: { ...p.content, headline: "Current version" } });
    const backup = JSON.parse(JSON.stringify(await createBackup(p, s.blobs)));
    const restored = await restoreBackup(backup, { blobs: s.blobs, projects: s.projects, newId: () => "copy-1" });
    expect(restored.id).toBe("copy-1");
    expect((await s.projects.loadProject("proj-backup"))!.content.headline).toBe("Current version");
    expect((await s.projects.loadProject("copy-1"))!.content.headline).toBe("Sweat Fest\n2026");
  });

  it("refuses damaged, foreign, incomplete or newer files without changing anything", async () => {
    const b = await browser();
    const s = await b.connect();
    const { p, photoId } = await creativeWithFiles(s.blobs);
    const good = JSON.parse(JSON.stringify(await createBackup(p, s.blobs)));
    const fresh = await (await browser()).connect();
    const deps = { blobs: fresh.blobs, projects: fresh.projects };
    await expect(restoreBackup({ hello: "world" }, deps)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreBackup({ ...good, backupVersion: 2 }, deps)).rejects.toThrow(/newer version/);
    await expect(restoreBackup({ ...good, files: { ...good.files, [photoId]: "data:image/jpeg;base64," + btoa("TAMPERED") } }, deps)).rejects.toThrow(/damaged/);
    const { [photoId]: _gone, ...without } = good.files;
    await expect(restoreBackup({ ...good, files: without }, deps)).rejects.toThrow(/missing/);
    expect(await fresh.projects.listProjects()).toEqual([]);
    // Export refuses to make an incomplete backup.
    const emptyStore = (await (await browser()).connect()).blobs;
    await expect(createBackup(p, emptyStore)).rejects.toThrow(/aren't in this browser/);
  });

  it("an older-format creative in a backup is upgraded on import", async () => {
    const fresh = await (await browser()).connect();
    const restored = await restoreBackup({ app: "sis-collaterals", backupVersion: 1, exportedAt: "", project: v1Draft("from-v1"), files: {}, logos: [] }, { blobs: fresh.blobs, projects: fresh.projects });
    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.content.headline).toBe("Saturday Morning Run");
  });
});

describe("no destructive storage behaviour", () => {
  it("opening the database (every startup) keeps all existing data; upgrading from older database versions only adds stores", async () => {
    const factory = new IDBFactory();
    // An old (version 2) database: blobs, logos, projects, meta — with data.
    await new Promise<void>((ok, fail) => {
      const req = factory.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("blobs");
        db.createObjectStore("logos", { keyPath: "id" });
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("meta");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["blobs", "logos", "projects", "meta"], "readwrite");
        tx.objectStore("blobs").put({ type: "image/png", data: new ArrayBuffer(3), bytes: 3, storedAt: "x" }, "b1");
        tx.objectStore("logos").put({ id: "l1", name: "Hive" });
        tx.objectStore("projects").put(v1Draft("p1"));
        tx.objectStore("meta").put("p1", "lastOpenedDraft");
        tx.oncomplete = () => {
          db.close();
          ok();
        };
        tx.onerror = () => fail(tx.error);
      };
      req.onerror = () => fail(req.error);
    });
    for (let launch = 0; launch < 3; launch++) {
      const db = await openDatabase(DB_NAME, factory);
      expect(db.version).toBe(DB_VERSION);
      expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
      expect(await idbGet(db, STORES.projects, "p1")).toEqual(v1Draft("p1"));
      expect(await idbGet(db, STORES.logos, "l1")).toEqual({ id: "l1", name: "Hive" });
      expect(await idbGet(db, STORES.blobs, "b1")).toBeTruthy();
      expect(await idbGet(db, STORES.meta, "lastOpenedDraft")).toBe("p1");
      const c = new SessionController({ projects: new IndexedDbProjectStore(db), session: new IndexedDbSessionStore(db), autosaveMs: 5 });
      await c.start();
      expect(c.getSnapshot().project.content.headline).toBe("Saturday Morning Run");
      db.close();
    }
  });

  it("the app never deletes the database, deletes or clears a store, or garbage-collects files", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(join(__dirname, "../src"));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/deleteDatabase|deleteObjectStore|objectStore\([^)]*\)\.clear\(|localStorage\.clear|indexedDB\.delete/);
      if (!f.endsWith("indexedDbBlobStore.ts") && !f.endsWith("types.ts")) expect(text, f).not.toMatch(/collectGarbage\(/);
    }
  });
});
