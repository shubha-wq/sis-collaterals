import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uploadPartnerLogo } from "@/assets/uploadLogo";
import { PhotoUploadError } from "@/assets/uploadPhoto";
import { IndexedDbPhotoLibrary } from "@/persistence/indexedDbPhotoLibrary";
import type { PhotoProcessor } from "@/persistence/types";
import { humanizeLogoName } from "@/assets/logoFiles";
import { EMPTY_CONTENT, createBlankProject, hasEventContent } from "@/model/blank";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { IndexedDbLogoLibrary } from "@/persistence/indexedDbLogoLibrary";
import { IndexedDbProjectStore, IndexedDbSessionStore } from "@/persistence/indexedDbProjectStore";
import type { LogoProcessor } from "@/persistence/types";
import { applyEdit } from "@/state/edits";
import { SessionController } from "@/state/sessionController";

/**
 * A "browser" is one IndexedDB factory + database name, exactly as in real
 * browsers where storage is per origin per profile. "Launching the app" is a
 * new SessionController over that browser's storage.
 */
async function browser(factory = new IDBFactory()) {
  const db = await openDatabase("sis-collaterals", factory);
  const blobs = new IndexedDbBlobStore(db);
  const projects = new IndexedDbProjectStore(db);
  const session = new IndexedDbSessionStore(db);
  let n = 0;
  const launch = async () => {
    const c = new SessionController({ projects, session, autosaveMs: 5, newId: () => `proj-${++n}-${Math.random()}` });
    await c.start();
    return c;
  };
  return { factory, db, blobs, projects, session, launch };
}

const fakePhotoProcessor: PhotoProcessor = {
  async process(file) {
    return { name: file.name.replace(/\.[a-z]+$/, ""), thumbnail: new Blob(["thumb"], { type: "image/jpeg" }), width: 1600, height: 1000 };
  },
};

function expectBlank(c: SessionController) {
  const { project, draftId } = c.getSnapshot();
  expect(draftId).toBeNull();
  expect(project.content).toEqual(EMPTY_CONTENT);
  expect(project.photo.source).toBeNull();
  expect(project.logos.partners).toEqual([]);
  expect(project.name).toBe("");
  expect(hasEventContent(project)).toBe(false);
}

describe("blank project", () => {
  it("has no event content of any kind", () => {
    const p = createBlankProject("x");
    expect(Object.values(p.content).every((v) => v === "")).toBe(true);
    expect(p.photo.source).toBeNull();
    expect(p.logos.partners).toEqual([]);
    expect(p.logos.background).toBe("none");
    expect(hasEventContent(p)).toBe(false);
  });
});

describe("launch", () => {
  it("first launch is a blank creative", async () => {
    const b = await browser();
    expectBlank(await b.launch());
  });

  it("a refresh with no saved draft is blank", async () => {
    const b = await browser();
    await b.launch();
    expectBlank(await b.launch());
  });

  it("unsaved content is not silently restored after a fresh launch", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Padel Night" });
    c.edit({ type: "photo", source: { kind: "builtin", id: "padel-hive-club" } });
    await c.flush();
    expect(c.getSnapshot().status).toBe("unsaved");
    expect(await b.projects.listProjects()).toEqual([]);
    expectBlank(await b.launch());
  });
});

describe("drafts", () => {
  it("a saved draft can be reopened, and later edits autosave", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Run Club" });
    await c.saveDraft();
    c.edit({ type: "content", field: "venue", value: "Cubbon Park" });
    await c.flush();
    expect(c.getSnapshot().status).toBe("saved");

    const again = await b.launch();
    expect(again.getSnapshot().draftId).toBe(c.getSnapshot().project.id);
    expect(again.getSnapshot().project.content.headline).toBe("Run Club");
    expect(again.getSnapshot().project.content.venue).toBe("Cubbon Park");
  });

  it("a saved draft is isolated to its browser; another browser starts blank", async () => {
    const laptop = await browser();
    const c = await laptop.launch();
    c.edit({ type: "content", field: "headline", value: "Only on the laptop" });
    await c.saveDraft();

    const otherBrowser = await browser(new IDBFactory());
    expectBlank(await otherBrowser.launch());
    expect(await otherBrowser.projects.listProjects()).toEqual([]);
    expect((await laptop.projects.listProjects()).map((d) => d.name)).toEqual(["Only on the laptop"]);
  });

  it("drafts list newest first and can be opened explicitly", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "First" });
    await c.saveDraft();
    const firstId = c.getSnapshot().project.id;
    await new Promise((r) => setTimeout(r, 5));
    await c.newCreative();
    c.edit({ type: "content", field: "headline", value: "Second" });
    await c.saveDraft();
    expect((await b.projects.listProjects()).map((d) => d.name)).toEqual(["Second", "First"]);
    expect(await c.openDraft(firstId)).toBe(true);
    expect(c.getSnapshot().project.content.headline).toBe("First");
  });

  it("deleting the open draft keeps the work on screen as unsaved", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Keep me visible" });
    await c.saveDraft();
    await c.deleteDraft(c.getSnapshot().project.id);
    expect(c.getSnapshot().draftId).toBeNull();
    expect(c.getSnapshot().project.content.headline).toBe("Keep me visible");
    expect(c.hasUnsavedWork()).toBe(true);
    expectBlank(await b.launch());
  });

  it("a draft that was deleted elsewhere doesn't break launch", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Gone" });
    await c.saveDraft();
    await b.projects.deleteProject(c.getSnapshot().project.id);
    expectBlank(await b.launch());
  });
});

describe("new creative", () => {
  it("is genuinely blank and carries over only template and format", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Old event" });
    c.edit({ type: "photo", source: { kind: "builtin", id: "padel-hive-club" } });
    c.edit({ type: "add-partner", logo: { id: "n", source: { kind: "builtin", id: "nike" } } });
    c.edit({ type: "style", style: { template: "block", format: "banner", accent: "teal" } });
    c.edit({ type: "logo-background", background: "paper" });
    const oldId = c.getSnapshot().project.id;
    await c.newCreative();
    expectBlank(c);
    const p = c.getSnapshot().project;
    expect(p.id).not.toBe(oldId);
    expect(p.style.template).toBe("block");
    expect(p.style.format).toBe("banner");
    expect(p.style.accent).toBe("coral");
    expect(p.logos.background).toBe("none");
  });

  it("after New creative, the next launch is blank (not the previous draft)", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "content", field: "headline", value: "Saved one" });
    await c.saveDraft();
    await c.newCreative();
    expectBlank(await b.launch());
    expect(await b.projects.listProjects()).toHaveLength(1);
  });

  it("asks before discarding unsaved work, never for an empty or saved creative", async () => {
    const b = await browser();
    const c = await b.launch();
    expect(c.hasUnsavedWork()).toBe(false);
    c.edit({ type: "content", field: "date", value: "12th October" });
    expect(c.hasUnsavedWork()).toBe(true);
    await c.saveDraft();
    expect(c.hasUnsavedWork()).toBe(false);
  });

  it("a logo in the library does not appear in a new creative", async () => {
    const b = await browser();
    const processor: LogoProcessor = {
      async process(file) {
        return { name: humanizeLogoName(file.name), original: file, originalType: "png", display: file, thumbnail: file, meta: { fileType: "png", vector: false, width: 800, height: 200, bytes: 1, looksOpaqueBackground: false } };
      },
    };
    const library = new IndexedDbLogoLibrary(b.db, b.blobs, processor);
    const c = await b.launch();
    const { project } = await uploadPartnerLogo(c.getSnapshot().project, new File(["x"], "aukera.png", { type: "image/png" }), library);
    c.edit({ type: "add-partner", logo: project.logos.partners[0]! });
    await c.newCreative();
    expect(c.getSnapshot().project.logos.partners).toEqual([]);
    expect(await library.listLogos()).toHaveLength(1);
  });
});

describe("progressive population (state level; canvas checks arrive with the Block template)", () => {
  it("an uploaded photo is on the creative immediately", async () => {
    const b = await browser();
    const c = await b.launch();
    const photos = new IndexedDbPhotoLibrary(b.db, b.blobs, fakePhotoProcessor);
    const r = await photos.addPhoto(new File(["jpeg"], "court.jpg", { type: "image/jpeg" }));
    const source = { kind: "upload" as const, blobId: r.blobId, libraryId: r.id, name: r.name };
    c.edit({ type: "photo", source });
    expect(c.getSnapshot().project.photo.source).toEqual(source);
    expect(await b.blobs.has((source as { blobId: string }).blobId)).toBe(true);
  });

  it("refuses non-photo uploads with a readable message", async () => {
    const b = await browser();
    const photos = new IndexedDbPhotoLibrary(b.db, b.blobs, fakePhotoProcessor);
    await expect(photos.addPhoto(new File(["x"], "doc.pdf", { type: "application/pdf" }))).rejects.toBeInstanceOf(PhotoUploadError);
  });

  it("an added logo is on the creative immediately; removing it takes it off", async () => {
    const b = await browser();
    const c = await b.launch();
    c.edit({ type: "add-partner", logo: { id: "n", source: { kind: "builtin", id: "nike" } } });
    expect(c.getSnapshot().project.logos.partners.map((p) => p.id)).toEqual(["n"]);
    c.edit({ type: "remove-partner", id: "n" });
    expect(c.getSnapshot().project.logos.partners).toEqual([]);
  });

  it("each text edit is reflected synchronously; clearing a field removes it", async () => {
    const b = await browser();
    const c = await b.launch();
    let renders = 0;
    c.subscribe(() => renders++);
    c.edit({ type: "content", field: "venue", value: "Hive Club" });
    expect(c.getSnapshot().project.content.venue).toBe("Hive Club");
    c.edit({ type: "content", field: "venue", value: "" });
    expect(c.getSnapshot().project.content.venue).toBe("");
    expect(renders).toBe(2);
    expect(hasEventContent(c.getSnapshot().project)).toBe(false);
  });

  it("Reset to Auto never deletes content", () => {
    let p = createBlankProject("x");
    p = applyEdit(p, { type: "content", field: "headline", value: "Keep" });
    p = applyEdit(p, { type: "overrides", overrides: { headlineSize: "large", textColour: "ink" } });
    p = applyEdit(p, { type: "photo-framing", focusX: 10, zoom: 2 });
    p = applyEdit(p, { type: "reset-to-auto" });
    expect(p.content.headline).toBe("Keep");
    expect(p.overrides).toEqual({});
    expect(p.photo.zoom).toBe(1);
  });
});

describe("photo library", () => {
  it("keeps uploaded photos in this browser, independent of drafts", async () => {
    const b = await browser();
    const photos = new IndexedDbPhotoLibrary(b.db, b.blobs, fakePhotoProcessor);
    const c = await b.launch();
    const r = await photos.addPhoto(new File(["court"], "court_night.jpg", { type: "image/jpeg" }));
    c.edit({ type: "photo", source: { kind: "upload", blobId: r.blobId, libraryId: r.id, name: r.name } });
    await c.newCreative();
    expect(c.getSnapshot().project.photo.source).toBeNull();
    expect((await photos.listPhotos()).map((p) => p.name)).toEqual(["court_night"]);
    // A fresh launch (no draft saved) is blank, but the photo library is still there.
    expectBlank(await b.launch());
    expect(await photos.listPhotos()).toHaveLength(1);
  });

  it("doesn't duplicate the same photo, lists newest first, keeps the original file", async () => {
    const b = await browser();
    const photos = new IndexedDbPhotoLibrary(b.db, b.blobs, fakePhotoProcessor);
    const a = await photos.addPhoto(new File(["same"], "a.jpg", { type: "image/jpeg" }));
    await new Promise((r) => setTimeout(r, 5));
    const again = await photos.addPhoto(new File(["same"], "copy.jpg", { type: "image/jpeg" }));
    expect(again.id).toBe(a.id);
    await photos.addPhoto(new File(["other"], "b.png", { type: "image/png" }));
    expect((await photos.listPhotos()).map((p) => p.name)).toEqual(["b", "a"]);
    expect(await (await b.blobs.get(a.blobId))!.text()).toBe("same");
  });

  it("deleting a library photo leaves creatives that use it working", async () => {
    const b = await browser();
    const photos = new IndexedDbPhotoLibrary(b.db, b.blobs, fakePhotoProcessor);
    const r = await photos.addPhoto(new File(["court"], "court.jpg", { type: "image/jpeg" }));
    await photos.deletePhoto(r.id);
    expect(await photos.listPhotos()).toEqual([]);
    expect(await b.blobs.has(r.blobId)).toBe(true);
  });
});

describe("storage upgrade", () => {
  it("upgrading from version 1 keeps existing library logos and adds the draft stores", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve) => {
      const req = factory.open("sis-collaterals", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("blobs");
        req.result.createObjectStore("logos", { keyPath: "id" }).put({ id: "old-logo", name: "Aukera", addedAt: "2026-10-01" });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    const b = await browser(factory);
    expect([...b.db.objectStoreNames].sort()).toEqual(["blobs", "logos", "meta", "photos", "projects"]);
    const lib = new IndexedDbLogoLibrary(b.db, b.blobs, { process: async () => { throw new Error("unused"); } });
    expect((await lib.listLogos()).map((l) => l.name)).toEqual(["Aukera"]);
    expectBlank(await b.launch());
  });
});

describe("no sample event content in the production app", () => {
  const SRC = join(__dirname, "../src");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

  it("editor, state and model code contain no sample event text", () => {
    const SAMPLES = /Padel Coaching|Coaching\\nWorkshop|10th October|4:00.7:00|Run with the Sisters|Sunrise Run Club|Basketball Beginner/i;
    const files = walk(SRC).filter((f) => /\/(editor|state|model|templates|layout)\//.test(f) && /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(SAMPLES);
  });

  it("the example project exists only as a test fixture", () => {
    for (const f of walk(SRC)) expect(readFileSync(f, "utf8"), f).not.toMatch(/exampleProject|fixtures\/projects/);
  });

  it("the blank project doesn't reference any built-in photo or partner", () => {
    const blank = readFileSync(join(SRC, "model/blank.ts"), "utf8");
    expect(blank).not.toMatch(/kind:\s*"builtin"/);
  });
});
