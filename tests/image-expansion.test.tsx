import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { exportReadiness } from "@/export/gate";
import { HttpExpansionService } from "@/expansion/http";
import { ExpansionManager } from "@/expansion/manager";
import { EXPANSION_NEGATIVE_PROMPT, EXPANSION_PROMPT } from "@/expansion/prompt";
import { expansionKey, expansionSpec, landscapePlacement } from "@/expansion/spec";
import { ExpansionError, type ExpansionRequest, type ExpansionService } from "@/expansion/types";
import { planWebPhoto } from "@/layout/webPhotoPlan";
import { MemoryLibraryBackend, MemorySharedAssets } from "@/library/memory";
import { CreativeLibrary, uploadsIn } from "@/library/service";
import type { ImageSource } from "@/model/assets";
import { createBlankProject } from "@/model/blank";
import type { ExpansionRecord, Project } from "@/model/project";
import { webFraming } from "@/model/webFraming";
import { openDatabase } from "@/persistence/idb";
import { IndexedDbBlobStore } from "@/persistence/indexedDbBlobStore";
import { applyEdit } from "@/state/edits";
import { rendererFor } from "@/templates/outputs";
import type { TemplateImages } from "@/templates/types";
import { reviewProject } from "@/validation/projectChecks";
import { handleExpandImage, selectProvider } from "../server/expansion/handler";
import type { ExpansionInput, ImageExpansionProvider } from "../server/expansion/provider";
import { STABILITY_OUTPAINT_URL, stabilityProvider } from "../server/expansion/stability";

/**
 * AI background expansion for the website outputs: geometry, the
 * generate-once cache, the server endpoint and provider adapter (with fake
 * HTTP; no real or paid calls), rendering and download gating, and the
 * Creative Library round trip.
 */

const W = 1600;
const H = 1000;
const PORTRAIT = { width: 720, height: 1280 };
const SOURCE: ImageSource = { kind: "upload", blobId: "a".repeat(64), name: "Portrait" };

async function blobs() {
  return new IndexedDbBlobStore(await openDatabase("x", new IDBFactory()));
}

/** A fake provider service: records requests, returns a distinct landscape file. */
function fakeService(opts: { fail?: number; notConfigured?: boolean } = {}) {
  const requests: ExpansionRequest[] = [];
  let failures = opts.fail ?? 0;
  const service: ExpansionService = {
    async expand(req) {
      requests.push(req);
      if (opts.notConfigured) throw new ExpansionError("not-configured", "AI background expansion isn't set up for this site.");
      if (failures > 0) {
        failures--;
        throw new ExpansionError("failed", "Provider timed out.");
      }
      return { image: new Blob([`landscape-${requests.length}-${req.outputWidth}x${req.outputHeight}`], { type: "image/jpeg" }), provider: "fake" };
    },
  };
  return { service, requests };
}

const prepare = vi.fn(async (url: string, w: number, h: number) => new Blob([`resampled:${url}:${w}x${h}`], { type: "image/png" }));

function manager(service: ExpansionService, store: IndexedDbBlobStore) {
  return new ExpansionManager({ service, blobs: store, prepare, now: () => new Date("2026-10-08T10:00:00Z") });
}
const specFor = (src = PORTRAIT) => expansionSpec(src.width, src.height, W, H)!;

describe("geometry", () => {
  it("a portrait photo is placed at full height and the AI is asked only for background on the free sides", () => {
    const s = specFor();
    expect(s.axis).toBe("x");
    expect(s.photoH).toBe(1000);
    expect(s.photoW).toBe(563);
    expect(s.left).toBe(Math.ceil(W - 720 * (1000 / 1280)));
    expect(s.right).toBe(s.left);
    expect(s.up + s.down).toBe(0);
    expect(s.masterH).toBe(H);
    expect(s.masterW).toBe(s.photoW + 2 * s.left);
  });

  it("one landscape covers the 1600 × 1000 frame for every focus position, so Listing and Banner share it", () => {
    const s = specFor();
    for (const fx of [0, 10, 25, 50, 75, 100]) {
      const plan = planWebPhoto(PORTRAIT.width, PORTRAIT.height, W, H, { fill: "fit", focusX: fx, focusY: 50, zoom: 1 });
      const at = landscapePlacement(s, plan.photo);
      expect(at.x).toBeLessThanOrEqual(0.01);
      expect(at.y).toBeLessThanOrEqual(0.01);
      expect(at.x + at.w).toBeGreaterThanOrEqual(W - 0.01);
      expect(at.y + at.h).toBeGreaterThanOrEqual(H - 0.01);
      // The landscape's copy of the photo lands exactly under the original.
      expect(at.x + s.photoX * (at.w / s.masterW)).toBeCloseTo(plan.photo.x, 0);
      expect(at.w / at.h).toBeCloseTo(s.masterW / s.masterH, 6); // uniform scale: never stretched
    }
  });

  it("panoramas expand up and down; a 16:10 photo needs nothing", () => {
    const pano = expansionSpec(3200, 800, W, H)!;
    expect(pano.axis).toBe("y");
    expect(pano.left + pano.right).toBe(0);
    expect(pano.up).toBe(H - pano.photoH);
    expect(expansionSpec(1600, 1000, W, H)).toBeNull();
  });

  it("the key depends only on the source photo and the geometry (not text, logos, colours, focus or output)", () => {
    const s = specFor();
    const k = expansionKey(SOURCE, s);
    expect(expansionKey({ ...SOURCE, name: "renamed" }, s)).toBe(k);
    expect(expansionKey({ ...SOURCE, blobId: "b".repeat(64) }, s)).not.toBe(k);
    expect(expansionKey({ kind: "builtin", id: "padel-hive-club" }, s)).not.toBe(k);
  });
});

describe("generate once, reuse, invalidate", () => {
  it("sends the placed photo (a resampled copy), the target size, the free sides and the protective prompt", async () => {
    const { service, requests } = fakeService();
    const m = manager(service, await blobs());
    const rec = await m.ensure({ source: SOURCE, sourceUrl: "blob:source", spec: specFor() });
    expect(requests).toHaveLength(1);
    const r = requests[0]!;
    expect([r.outputWidth, r.outputHeight]).toEqual([specFor().masterW, 1000]);
    expect([r.left, r.right, r.up, r.down]).toEqual([specFor().left, specFor().left, 0, 0]);
    expect(specFor().left).toBe(1038);
    expect(r.instructions).toBe(EXPANSION_PROMPT);
    expect(r.instructions).toMatch(/Keep the original photograph and all original subjects completely unchanged/);
    expect(r.negative).toBe(EXPANSION_NEGATIVE_PROMPT);
    expect(prepare).toHaveBeenCalledWith("blob:source", 563, 1000);
    expect(rec).toMatchObject({ key: expansionKey(SOURCE, specFor()), masterW: specFor().masterW, masterH: 1000, photoX: 1038, provider: "fake" });
  });

  it("the derivative is a separate stored file; the source file is never touched", async () => {
    const store = await blobs();
    const sourceId = await store.put(new Blob(["ORIGINAL PHOTO BYTES"], { type: "image/jpeg" }));
    const source: ImageSource = { kind: "upload", blobId: sourceId, name: "p" };
    const { service } = fakeService();
    const rec = (await manager(service, store).ensure({ source, sourceUrl: "blob:x", spec: specFor() }))!;
    expect(rec.blobId).not.toBe(sourceId);
    expect(await (await store.get(sourceId))!.text()).toBe("ORIGINAL PHOTO BYTES");
    expect(await (await store.get(rec.blobId))!.text()).toMatch(/^landscape-1-/);
  });

  it("Listing and Banner (and concurrent requests) share one generation", async () => {
    const { service, requests } = fakeService();
    const m = manager(service, await blobs());
    const args = { source: SOURCE, sourceUrl: "blob:s", spec: specFor() };
    const [a, b] = await Promise.all([m.ensure(args), m.ensure(args)]);
    expect(requests).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it("reuses the project's derivative: switching outputs, editing text, logos, colours or focus never regenerates", async () => {
    const store = await blobs();
    const { service, requests } = fakeService();
    const m = manager(service, store);
    const rec = (await m.ensure({ source: SOURCE, sourceUrl: "blob:s", spec: specFor() }))!;
    let p = withExpansion(project("website-listing"), rec);
    const edits = [
      { type: "output", output: "website-banner" },
      { type: "content", field: "headline", value: "New title" },
      { type: "content", field: "venue", value: "HSR" },
      { type: "add-partner", logo: { id: "n", source: { kind: "builtin", id: "nike" } } },
      { type: "text-colour", role: "headline", colour: "teal" },
      { type: "web-framing", output: "website-banner", focusX: 80 },
      { type: "output", output: "website-listing" },
    ] as const;
    for (const e of edits) {
      p = applyEdit(p, e as Parameters<typeof applyEdit>[1]);
      const again = await m.ensure({ source: p.photo.source!, sourceUrl: "blob:s", spec: specFor(), current: p.photo.expansion });
      expect(again, e.type).toEqual(rec);
    }
    expect(requests).toHaveLength(1);
  });

  it("changing the source photo invalidates the derivative", async () => {
    const store = await blobs();
    const { service, requests } = fakeService();
    const m = manager(service, store);
    const rec = (await m.ensure({ source: SOURCE, sourceUrl: "blob:s", spec: specFor() }))!;
    let p = withExpansion(project("website-listing"), rec);
    p = applyEdit(p, { type: "photo", source: { kind: "upload", blobId: "c".repeat(64), name: "Other" } });
    expect(p.photo.expansion).toBeUndefined();
    await m.ensure({ source: p.photo.source!, sourceUrl: "blob:other", spec: specFor(), current: p.photo.expansion });
    expect(requests).toHaveLength(2);
  });

  it("a failure keeps the original, isn't retried in a loop, and Try again works", async () => {
    const store = await blobs();
    const { service, requests } = fakeService({ fail: 1 });
    const m = manager(service, store);
    const args = { source: SOURCE, sourceUrl: "blob:s", spec: specFor() };
    expect(await m.ensure(args)).toBeNull();
    const key = expansionKey(SOURCE, specFor());
    expect(m.status(key)).toEqual({ state: "failed", message: "Provider timed out." });
    expect(await m.ensure(args)).toBeNull(); // no automatic re-call
    expect(requests).toHaveLength(1);
    const rec = await m.retry(args);
    expect(rec?.key).toBe(key);
    expect(m.status(key).state).toBe("ready");
    expect(requests).toHaveLength(2);
  });

  it("no provider configured: marked unavailable (fallback), never retried in a loop", async () => {
    const { service, requests } = fakeService({ notConfigured: true });
    const m = manager(service, await blobs());
    const args = { source: SOURCE, sourceUrl: "blob:s", spec: specFor() };
    await m.ensure(args);
    await m.ensure(args);
    expect(requests).toHaveLength(1);
    expect(m.status(expansionKey(SOURCE, specFor())).state).toBe("unavailable");
  });

  it("a missing stored derivative is regenerated (a broken file never blocks for good)", async () => {
    const store = await blobs();
    const { service, requests } = fakeService();
    const m = manager(service, store);
    const ghost: ExpansionRecord = { ...((await m.ensure({ source: SOURCE, sourceUrl: "s", spec: specFor() }))!), blobId: "d".repeat(64) };
    const fresh = await m.ensure({ source: SOURCE, sourceUrl: "s", spec: specFor(), current: ghost });
    expect(requests).toHaveLength(2);
    expect(fresh!.blobId).not.toBe(ghost.blobId);
    expect(await store.has(fresh!.blobId)).toBe(true);
  });
});

function project(output: Project["style"]["output"]): Project {
  const p = createBlankProject("w", new Date(), { output, format: "banner" });
  return { ...p, photo: { ...p.photo, source: SOURCE } };
}
function withExpansion(p: Project, rec: ExpansionRecord): Project {
  return applyEdit(p, { type: "photo-expansion", expansion: rec });
}
function imgs(_p: Project, landscape?: string, status?: TemplateImages["expansionStatus"]): TemplateImages {
  return {
    photo: { state: "ready", image: { url: "blob:ORIGINAL", ...PORTRAIT } },
    sis: SIS_DRAWABLE,
    partners: [],
    landscape: landscape ? { state: "ready", image: { url: landscape, width: specFor().masterW, height: 1000 } } : { state: "empty" },
    expansionStatus: status,
  };
}
function record(): ExpansionRecord {
  const s = specFor();
  return { key: expansionKey(SOURCE, s), blobId: "e".repeat(64), masterW: s.masterW, masterH: s.masterH, photoX: s.photoX, photoY: s.photoY, photoW: s.photoW, photoH: s.photoH, provider: "fake", createdAt: "2026-10-08T10:00:00Z" };
}
const render = (p: Project, i: TemplateImages) => {
  const C = rendererFor(p).Component!;
  return renderToStaticMarkup(<C project={p} images={i} mode="export" />);
};

describe("rendering and download", () => {
  it("Listing and Banner draw the same landscape, with the untouched original on top", () => {
    for (const o of ["website-listing", "website-banner"] as const) {
      const p = withExpansion(project(o), record());
      const html = render(p, imgs(p, "blob:LANDSCAPE"));
      expect(html, o).toMatch(/data-landscape="ai"/);
      const landAt = html.indexOf('data-slot="photo-landscape"');
      const origAt = html.indexOf('data-slot="photo-image"');
      expect(landAt).toBeGreaterThan(-1);
      expect(origAt).toBeGreaterThan(landAt); // original drawn after (on top of) the landscape
      expect(html).toMatch(/data-slot="photo-landscape"[^>]*src="blob:LANDSCAPE"/);
      expect(html).toMatch(/data-slot="photo-image" src="blob:ORIGINAL"/);
      expect(html).not.toContain("photo-extension"); // no edge fill when AI is ready
    }
  });

  it("the Banner keeps the photo left of the arc by default; the arc stays a separate layer", () => {
    const p = withExpansion(project("website-banner"), record());
    const html = render(p, imgs(p, "blob:LANDSCAPE"));
    const [x] = html.match(/data-photo-rect="([^"]+)"/)![1]!.split(",").map(Number) as [number];
    expect(x).toBe(0);
    expect(webFraming(p, "website-banner", PORTRAIT).focusX).toBe(0);
    expect(html).toMatch(/<svg[^>]*data-layer="decor"[^>]*data-slot="arc"/);
  });

  it("Download is blocked while generating or after a failure, and allowed once ready", () => {
    const p = project("website-listing");
    const pending = reviewProject(p, imgs(p), { status: "fits", step: 0 });
    expect(exportReadiness(pending, imgs(p)).ok).toBe(false);
    expect(pending.find((i) => i.id === "expansion-pending")?.message).toMatch(/Generating landscape image/);
    const failed = imgs(p, undefined, { state: "failed", message: "Timed out." });
    expect(exportReadiness(reviewProject(p, failed, { status: "fits", step: 0 }), failed).ok).toBe(false);
    const ready = withExpansion(p, record());
    const ok = imgs(ready, "blob:L");
    expect(exportReadiness(reviewProject(ready, ok, { status: "fits", step: 0 }), ok).ok).toBe(true);
    // A landscape-format photo that fills the frame never needs AI.
    const wide = { ...imgs(p), photo: { state: "ready" as const, image: { url: "u", width: 1800, height: 1200 } } };
    expect(reviewProject(p, wide, { status: "fits", step: 0 }).some((i) => i.id.startsWith("expansion-"))).toBe(false);
  });

  it("the Instagram creative is unaffected", () => {
    const p = applyEdit(project("website-listing"), { type: "output", output: "instagram" });
    expect(reviewProject(p, imgs(p), { status: "fits", step: 0 }).some((i) => i.id.startsWith("expansion-"))).toBe(false);
  });
});

describe("Creative Library", () => {
  it("shares the generated landscape with the creative and reopens it without regenerating", async () => {
    const a = await blobs();
    const sourceId = await a.put(new Blob(["SRC"], { type: "image/jpeg" }));
    const source: ImageSource = { kind: "upload", blobId: sourceId, name: "Portrait" };
    const { service, requests } = fakeService();
    const rec = (await manager(service, a).ensure({ source, sourceUrl: "s", spec: specFor() }))!;
    let p = createBlankProject("lib", new Date(), { output: "website-banner", format: "banner" });
    p = applyEdit(applyEdit(p, { type: "photo", source }), { type: "photo-expansion", expansion: rec });
    expect(uploadsIn(p).map((u) => u.blobId)).toEqual([sourceId, rec.blobId]);
    const team = { backend: new MemoryLibraryBackend(), assets: new MemorySharedAssets() };
    const saved = await new CreativeLibrary({ ...team, blobs: a }).saveNew(p);
    expect(team.assets.blobs.has(rec.blobId)).toBe(true);
    const b = await blobs(); // a teammate's browser
    const opened = await new CreativeLibrary({ ...team, blobs: b }).open(saved.id);
    expect(opened.project.photo.expansion).toEqual(rec);
    expect(await b.has(rec.blobId)).toBe(true);
    const again = await manager(service, b).ensure({ source, sourceUrl: "s", spec: specFor(), current: opened.project.photo.expansion });
    expect(again).toEqual(rec);
    expect(requests).toHaveLength(1);
  });
});

describe("browser client (no key, checks the result)", () => {
  const req = (): ExpansionRequest => ({ image: new Blob(["p"], { type: "image/png" }), left: 1037, right: 1037, up: 0, down: 0, outputWidth: 2637, outputHeight: 1000, instructions: EXPANSION_PROMPT, negative: EXPANSION_NEGATIVE_PROMPT });

  it("posts to the app's own endpoint with the request fields only", async () => {
    let sent: FormData | null = null;
    let url = "";
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      sent = init.body as FormData;
      return new Response(new Blob(["img"], { type: "image/jpeg" }), { headers: { "x-expansion-provider": "stability-outpaint" } });
    }) as unknown as typeof fetch;
    const out = await new HttpExpansionService("/api/expand-image", fetchImpl, async () => ({ width: 2637, height: 1000 })).expand(req());
    expect(url).toBe("/api/expand-image");
    expect(sent!.get("left")).toBe("1037");
    expect(sent!.get("outputWidth")).toBe("2637");
    expect(sent!.get("instructions")).toBe(EXPANSION_PROMPT);
    expect([...sent!.keys()].some((k) => /key|token|auth/i.test(k))).toBe(false);
    expect(out.provider).toBe("stability-outpaint");
  });

  it("501 means not configured; a result of the wrong shape is rejected, never stretched", async () => {
    const notSet = (async () => new Response("{}", { status: 501 })) as unknown as typeof fetch;
    await expect(new HttpExpansionService("/x", notSet, async () => ({ width: 1, height: 1 })).expand(req())).rejects.toMatchObject({ code: "not-configured" });
    const ok = (async () => new Response(new Blob(["i"]))) as unknown as typeof fetch;
    await expect(new HttpExpansionService("/x", ok, async () => ({ width: 1600, height: 1000 })).expand(req())).rejects.toMatchObject({ code: "invalid-result" });
    // Same shape at a different size is fine (scaled uniformly when drawn).
    await expect(new HttpExpansionService("/x", ok, async () => ({ width: 1318, height: 500 })).expand(req())).resolves.toBeTruthy();
  });
});

describe("server endpoint", () => {
  function form(over: Record<string, string> = {}, image: Blob | null = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })) {
    const fd = new FormData();
    if (image) fd.append("image", image, "photo.png");
    const fields = { left: "1037", right: "1037", up: "0", down: "0", outputWidth: "2637", outputHeight: "1000", ...over };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return new Request("http://local/api/expand-image", { method: "POST", body: fd });
  }
  const fakeProvider = () => {
    const calls: ExpansionInput[] = [];
    const p: ImageExpansionProvider = {
      name: "fake",
      async expand(input) {
        calls.push(input);
        return { image: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
      },
    };
    return { p, calls };
  };

  it("is not configured without a provider key (501), and picks Stability only when its key is set", async () => {
    const res = await handleExpandImage(form(), {});
    expect(res.status).toBe(501);
    expect((await res.json()).error).toBe("not-configured");
    expect(selectProvider({})).toBeNull();
    expect(selectProvider({ STABILITY_API_KEY: "sk-test" })?.name).toBe("stability-outpaint");
    expect(selectProvider({ IMAGE_EXPANSION_PROVIDER: "stability" })).toBeNull();
  });

  it("passes the photo, the sides, the target size and the protective prompt to the provider", async () => {
    const { p, calls } = fakeProvider();
    const res = await handleExpandImage(form(), {}, p);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-expansion-provider")).toBe("fake");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0]).toMatchObject({ left: 1037, right: 1037, up: 0, down: 0, outputWidth: 2637, outputHeight: 1000, mime: "image/png", prompt: EXPANSION_PROMPT, negativePrompt: EXPANSION_NEGATIVE_PROMPT });
  });

  it("rejects bad requests without calling the provider", async () => {
    const { p, calls } = fakeProvider();
    expect((await handleExpandImage(new Request("http://l/", { method: "GET" }), {}, p)).status).toBe(405);
    expect((await handleExpandImage(form({}, null), {}, p)).status).toBe(400);
    expect((await handleExpandImage(form({}, new Blob(["x"], { type: "text/plain" })), {}, p)).status).toBe(400);
    expect((await handleExpandImage(form({ left: "-5" }), {}, p)).status).toBe(400);
    expect((await handleExpandImage(form({ left: "0", right: "0" }), {}, p)).status).toBe(400);
    expect((await handleExpandImage(form({ outputWidth: "99999" }), {}, p)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("reports provider failures as 502 without leaking the key", async () => {
    const failing = stabilityProvider("sk-SECRET", { fetchImpl: (async () => new Response("bad key sk-SECRET", { status: 500 })) as unknown as typeof fetch });
    const res = await handleExpandImage(form(), {}, failing);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("sk-SECRET");
  });

  it("the Stability adapter calls outpaint with the key in the server request only, the sides, the prompt and JPEG output", async () => {
    let init: RequestInit | undefined;
    let url = "";
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return new Response(new Uint8Array([9]), { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const out = await stabilityProvider("sk-test", { fetchImpl }).expand({ image: new Uint8Array([1]), mime: "image/png", left: 1037, right: 1037, up: 0, down: 0, outputWidth: 2637, outputHeight: 1000, prompt: EXPANSION_PROMPT, negativePrompt: EXPANSION_NEGATIVE_PROMPT });
    expect(url).toBe(STABILITY_OUTPAINT_URL);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const fd = init!.body as FormData;
    expect(fd.get("left")).toBe("1037");
    expect(fd.get("up")).toBeNull();
    expect(String(fd.get("prompt"))).toContain("Keep the original photograph");
    expect(String(fd.get("prompt"))).toContain("Avoid: new people");
    expect(fd.get("output_format")).toBe("jpeg");
    expect(out.mime).toBe("image/jpeg");
  });
});
