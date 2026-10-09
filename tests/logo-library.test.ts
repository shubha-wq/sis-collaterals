import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveImage } from "@/assets/resolveImage";
import { uploadPartnerLogo } from "@/assets/uploadLogo";
import { humanizeLogoName } from "@/assets/logoFiles";
import { exampleProject } from "./fixtures/projects";
import { MAX_PARTNER_LOGOS } from "@/model/project";
import { blobsUsedBy } from "@/model/references";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { IndexedDbLogoLibrary } from "@/persistence/indexedDbLogoLibrary";
import type { LogoProcessor } from "@/persistence/types";

/** Stand-in for the canvas-based processor: no DOM in Node. */
const fakeProcessor: LogoProcessor = {
  async process(file) {
    const svg = file.name.endsWith(".svg");
    return {
      name: humanizeLogoName(file.name),
      original: file,
      originalType: svg ? "svg" : "png",
      display: file,
      thumbnail: new Blob(["thumb:" + (await file.text())], { type: "image/png" }),
      meta: { fileType: svg ? "svg" : "png", vector: svg, width: 800, height: 200, bytes: file.size, looksOpaqueBackground: false },
    };
  },
};

const file = (name: string, body = name) => new File([body], name, { type: name.endsWith(".svg") ? "image/svg+xml" : "image/png" });

let blobs: IndexedDbBlobStore;
let library: IndexedDbLogoLibrary;

beforeEach(async () => {
  const db = await openDatabase("test-" + Math.random(), new IDBFactory());
  blobs = new IndexedDbBlobStore(db);
  library = new IndexedDbLogoLibrary(db, blobs, fakeProcessor);
});

describe("LogoLibrary", () => {
  it("adds a logo with a readable name, original file and thumbnail", async () => {
    const r = await library.addLogo(file("aukera_logo-final.svg", "<svg/>"));
    expect(r.name).toBe("Aukera");
    expect(r.originalType).toBe("svg");
    expect(r.meta.vector).toBe(true);
    expect(await (await blobs.get(r.originalBlobId))!.text()).toBe("<svg/>");
    expect(await blobs.has(r.thumbnailBlobId)).toBe(true);
  });

  it("keeps the original bytes and type exactly", async () => {
    const r = await library.addLogo(file("mille.png", "PNGDATA"));
    const got = await library.getLogo(r.id);
    expect(got!.blob.type).toBe("image/png");
    expect(await got!.blob.text()).toBe("PNGDATA");
  });

  it("doesn't duplicate the same file uploaded twice", async () => {
    const a = await library.addLogo(file("mille.png", "same"));
    const b = await library.addLogo(file("mille-copy.png", "same"));
    expect(b.id).toBe(a.id);
    expect(await library.listLogos()).toHaveLength(1);
  });

  it("lists newest first and survives reopening (persistence)", async () => {
    await library.addLogo(file("one.png"));
    await new Promise((r) => setTimeout(r, 5));
    await library.addLogo(file("two.png"));
    expect((await library.listLogos()).map((l) => l.name)).toEqual(["Two", "One"]);
  });

  it("renames, trimming whitespace, and refuses an empty name", async () => {
    const r = await library.addLogo(file("x.png"));
    expect((await library.renameLogo(r.id, "  Dame   Health ")).name).toBe("Dame Health");
    await expect(library.renameLogo(r.id, "   ")).rejects.toThrow("Give the logo a name.");
    await expect(library.renameLogo("nope", "A")).rejects.toThrow();
  });

  it("deleting removes the entry but not the file", async () => {
    const r = await library.addLogo(file("x.png"));
    await library.deleteLogo(r.id);
    expect(await library.listLogos()).toEqual([]);
    expect(await library.getLogo(r.id)).toBeNull();
    expect(await blobs.has(r.blobId)).toBe(true);
  });
});

describe("upload → add to creative → save to library", () => {
  it("does all three in one action, with background left at None", async () => {
    const project = exampleProject("p");
    const { project: next, record, issues } = await uploadPartnerLogo(project, file("dame-health.png"), library);
    expect((await library.listLogos()).map((l) => l.id)).toEqual([record.id]);
    const added = next.logos.partners.at(-1)!;
    expect(added.source).toEqual({ kind: "upload", blobId: record.blobId, libraryId: record.id, name: "Dame Health" });
    expect(next.logos.background).toBe("none");
    expect(issues).toEqual([]);
  });

  it("never adds the same logo to a creative twice", async () => {
    const a = await uploadPartnerLogo(exampleProject("p"), file("m.png", "same"), library);
    const b = await uploadPartnerLogo(a.project, file("m.png", "same"), library);
    expect(b.project.logos.partners).toHaveLength(a.project.logos.partners.length);
  });

  it("when the logo row is full, saves to the library and says so instead of replacing", async () => {
    let p = exampleProject("p");
    for (let i = 0; i < MAX_PARTNER_LOGOS; i++) p = (await uploadPartnerLogo(p, file(`l${i}.png`), library)).project;
    expect(p.logos.partners).toHaveLength(MAX_PARTNER_LOGOS);
    const res = await uploadPartnerLogo(p, file("extra.png"), library);
    expect(res.project.logos.partners).toHaveLength(MAX_PARTNER_LOGOS);
    expect(res.issues[0]!.id).toBe("logo-row-full");
    expect((await library.listLogos()).some((l) => l.name === "Extra")).toBe(true);
  });
});

describe("deleted and missing logos never break a project", () => {
  it("a project keeps rendering a logo deleted from the library", async () => {
    const { project, record } = await uploadPartnerLogo(exampleProject("p"), file("mille.png"), library);
    await library.deleteLogo(record.id);
    const resolved = await resolveImage(project.logos.partners.at(-1)!.source, blobs);
    expect(resolved.status).toBe("ready");
  });

  it("storage clean-up keeps files a project or the library still uses", async () => {
    const { project, record } = await uploadPartnerLogo(exampleProject("p"), file("keep.png"), library);
    const orphan = await library.addLogo(file("orphan.png"));
    await library.deleteLogo(record.id);
    await library.deleteLogo(orphan.id);
    const referenced = new Set([...blobsUsedBy(project), ...(await library.referencedBlobs())]);
    await blobs.collectGarbage(referenced);
    expect(await blobs.has(record.blobId)).toBe(true);
    expect(await blobs.has(orphan.blobId)).toBe(false);
  });

  it("a file that's gone (site data cleared) resolves as missing, not an error", async () => {
    const r = await resolveImage({ kind: "upload", blobId: "gone", name: "Gone" }, blobs);
    expect(r.status).toBe("missing");
  });

  it("an unknown built-in id resolves as missing", async () => {
    expect((await resolveImage({ kind: "builtin", id: "hive-club" }, blobs)).status).toBe("missing");
    expect((await resolveImage({ kind: "builtin", id: "sis" }, blobs)).status).toBe("ready");
  });

  it("a storage failure resolves as missing", async () => {
    const broken = { ...blobs, get: () => Promise.reject(new Error("quota")) } as unknown as IndexedDbBlobStore;
    expect((await resolveImage({ kind: "upload", blobId: "x", name: "X" }, broken)).status).toBe("missing");
  });
});
