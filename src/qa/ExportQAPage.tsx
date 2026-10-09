import { useEffect, useState } from "react";
import { exportCreative } from "@/export/exportCreative";
import { exportFileName } from "@/export/filename";
import { ExportError } from "@/export/render";
import { exportReadiness } from "@/export/gate";
import { reviewProject } from "@/validation/projectChecks";
import { FORMATS } from "@/model/formats";
import { COLORS } from "@/design-system/tokens";
import { rendererFor } from "@/templates/outputs";
import type { TemplateId } from "@/model/project";
import { TEMPLATES } from "@/templates/registry";
import type { TemplateImages } from "@/templates/types";
import { templateFixtures, webFixtures, type TemplateFixture } from "./templateFixtures";
import "./qa.css";

/**
 * Developer-only export QA: runs the real export pipeline (hidden 1:1 stage →
 * PNG) on cases across every template and format, then decodes each PNG and
 * checks its size, square opaque corners and that it has real content.
 * Results are shown as images for visual review and on window.__exportQA.
 */

interface Row {
  key: string;
  label: string;
  expectBlocked?: boolean;
  url?: string;
  fileName?: string;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
}

declare global {
  interface Window {
    __exportQA?: { done: boolean; total: number; failed: Array<{ key: string; failed: string[] }> };
  }
}

const params = new URLSearchParams(window.location.search);
const ONLY_TEMPLATES = params.get("template")?.split(",") ?? null;
/** ?show=website-banner/web-all shows just that exported PNG at 1:1 (for full-size visual review). */
const SHOW = params.get("show");
/** ?web=0 skips the website outputs; ?web=only runs just them. */
const WEB = params.get("web") ?? "1";
const WEB_STATES = ["web-landscape-unavailable", "web-text-colours", "web-photo-only", "web-photo-headline", "web-photo-details", "web-photo-logos", "web-all", "web-long-venue", "web-long-headline", "web-square", "web-32", "web-portrait-left", "photo-panorama", "photo-tower"];
const STATES = (params.get("only")?.split(",") ?? ["normal", "no-photo", "plate-paper-4", "long-combo", "minimal", "blue", "ground-colour", "slab-ink-no-photo", "text-colours-mixed", "text-colours-no-photo"]).filter(Boolean);

/** Website checks on the decoded PNG: the Banner's top-right corner is SIS coral; the Listing has no arc there. */
async function inspectWeb(blob: Blob, output: string) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(bmp.width - 3, 2, 1, 1).data;
  bmp.close();
  const hex = COLORS.coral.replace("#", "");
  const target = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const isCoral = target.every((v, i) => Math.abs(v - d[i]!) <= 3);
  const detail = `top-right ${d[0]},${d[1]},${d[2]}`;
  return output === "website-banner" ? [{ name: "arc in coral, top-right", pass: isCoral, detail }] : [{ name: "no arc", pass: !isCoral, detail }];
}

async function sampleAt(blob: Blob, x: number, y: number): Promise<number[]> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
}

/** Share of pixels that differ between two PNGs of the same size. */
async function pixelDiff(a: Blob, b: Blob): Promise<number> {
  const read = async (blob: Blob) => {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const [x, y] = await Promise.all([read(a), read(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!) > 24) diff++;
  return diff / (x.length / 4);
}

async function inspect(blob: Blob, w: number, h: number) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const px = (x: number, y: number) => g.getImageData(x, y, 1, 1).data;
  const corners = [px(0, 0), px(bmp.width - 1, 0), px(0, bmp.height - 1), px(bmp.width - 1, bmp.height - 1)];
  // Content: distinct colours across a 40 × 40 grid (fine enough to hit text on a plain ground).
  const seen = new Set<string>();
  for (let y = 0; y < bmp.height; y += Math.floor(bmp.height / 40)) for (let x = 0; x < bmp.width; x += Math.floor(bmp.width / 40)) {
    const d = px(x, y);
    seen.add(`${d[0]! >> 4},${d[1]! >> 4},${d[2]! >> 4}`);
  }
  const out = [
    { name: "exact size", pass: bmp.width === w && bmp.height === h, detail: `${bmp.width}×${bmp.height}` },
    { name: "square opaque corners", pass: corners.every((d) => d[3] === 255), detail: corners.map((d) => d[3]).join(",") },
    { name: "has content", pass: seen.size >= 3, detail: `${seen.size} colours` },
    { name: "PNG", pass: blob.type === "image/png" },
  ];
  bmp.close();
  return out;
}

/** An uploaded-style SVG logo and photo, served from blob: URLs like real uploads. */
function uploadedImages(): { logo: string; photo: Promise<string> } {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300"><rect x="0" y="40" width="1200" height="220" rx="110" fill="#110405"/><text x="600" y="190" font-family="Arial" font-weight="700" font-size="120" text-anchor="middle" fill="#FAF0E4">UPLOADED</text></svg>';
  const logo = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1066;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 1600, 1066);
  gr.addColorStop(0, "#17BEBB");
  gr.addColorStop(1, "#1D4E9B");
  g.fillStyle = gr;
  g.fillRect(0, 0, 1600, 1066);
  g.fillStyle = "#FFD33B";
  g.beginPath();
  g.arc(1100, 420, 220, 0, 7);
  g.fill();
  const photo = new Promise<string>((r) => c.toBlob((b) => r(URL.createObjectURL(b!)), "image/jpeg", 0.9));
  return { logo, photo };
}

export function ExportQAPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let live = true;
    window.__exportQA = { done: false, total: 0, failed: [] };
    (async () => {
      await document.fonts.ready;
      const cases: Array<{ key: string; label: string; fx: TemplateFixture & { landscape?: string }; images?: TemplateImages; expectBlocked?: boolean; web?: string; gateOnly?: boolean }> = [];
      const templates = WEB === "only" ? [] : TEMPLATES.filter((t) => t.component && (!ONLY_TEMPLATES || ONLY_TEMPLATES.includes(t.id)));
      for (const t of templates) {
        for (const f of ["feed", "banner"] as const) {
          const all = templateFixtures(t.id as TemplateId, f);
          for (const id of STATES) {
            const fx = id === "plate-paper-4" ? { ...all.find((x) => x.id === "logos-4")!, project: { ...all.find((x) => x.id === "logos-4")!.project, logos: { ...all.find((x) => x.id === "logos-4")!.project.logos, background: "paper" as const } } } : all.find((x) => x.id === id);
            if (fx && (!SHOW || SHOW === `${t.id}/${f}/${id}`)) cases.push({ key: `${t.id}/${f}/${id}`, label: `${t.label} · ${FORMATS[f].label} · ${id}`, fx });
          }
          const impossible = all.find((x) => x.id === "impossible")!;
          if (!SHOW) cases.push({ key: `${t.id}/${f}/impossible`, label: `${t.label} · ${FORMATS[f].label} · impossible (must be refused)`, fx: impossible, expectBlocked: true });
        }
      }
      // Real uploads (blob: URLs): photo + transparent SVG logo, two templates.
      const up = uploadedImages();
      const photoUrl = await up.photo;
      for (const t of SHOW || WEB === "only" ? [] : (["broadsheet", "poster"] as const)) {
        const fx = templateFixtures(t, "feed").find((x) => x.id === "logos-1")!;
        cases.push({
          key: `${t}/feed/uploads`,
          label: `${t} · Feed · uploaded photo + SVG logo`,
          fx,
          images: { ...fx.images, photo: { state: "ready", image: { url: photoUrl, width: 1600, height: 1066 } }, partners: [{ id: "l0", slot: { state: "ready", image: { url: up.logo, width: 1200, height: 300 } } }] },
        });
      }

      // Website Banner and Listing: same pipeline, 1600 × 1000, no template.
      if (WEB !== "0") {
        for (const o of ["website-banner", "website-listing"] as const) {
          const all = webFixtures(o);
          for (const id of WEB_STATES) {
            const fx = all.find((x) => x.id === id);
            if (fx && (!SHOW || SHOW === `${o}/${id}`)) cases.push({ key: `${o}/${id}`, label: `${o === "website-banner" ? "Website Banner" : "Website Listing"} · ${fx.label}`, fx, web: o });
          }
        }
        // A landscape still generating (or failed) must keep Download disabled.
        for (const id of ["web-landscape-pending", "web-landscape-failed"]) {
          for (const o of ["website-banner", "website-listing"] as const) {
            const fx = webFixtures(o).find((x) => x.id === id)!;
            if (!SHOW) cases.push({ key: `${o}/${id}`, label: `${o === "website-banner" ? "Website Banner" : "Website Listing"} · ${fx.label}`, fx, web: o, gateOnly: true });
          }
        }
        const imp = webFixtures("website-banner").find((x) => x.id === "web-impossible")!;
        if (!SHOW) cases.push({ key: "website-banner/web-impossible", label: "Website Banner · impossible (must be refused)", fx: imp, expectBlocked: true, web: "website-banner" });
      }

      const out: Row[] = [];
      for (const c of cases) {
        if (!live) return;
        const { width, height } = rendererFor(c.fx.project);
        if (c.gateOnly) {
          const imgs = c.images ?? c.fx.images;
          const gate = exportReadiness(reviewProject(c.fx.project, imgs, { status: "fits", step: 0 }), imgs);
          out.push({ key: c.key, label: c.label, expectBlocked: true, checks: [{ name: "download disabled", pass: !gate.ok, detail: gate.reasons.join(" ") }] });
          setRows([...out]);
          continue;
        }
        try {
          const { blob } = await exportCreative(c.fx.project, c.images ?? c.fx.images);
          const checks = c.expectBlocked ? [{ name: "refused", pass: false, detail: "exported a creative that can't fit" }] : [...(await inspect(blob, width, height)), ...(c.web ? await inspectWeb(blob, c.web) : [])];
          // A whole photo with a ready landscape: the PNG's free side shows the landscape, not bare ground.
          if (c.web && c.fx.landscape === "ready" && c.fx.project.photo.expansion) {
            const edge = await sampleAt(blob, 4, Math.round(height / 2));
            const ink = [17, 4, 5];
            const bare = edge.every((v, i) => Math.abs(v - ink[i]!) < 12);
            checks.push({ name: "landscape in PNG", pass: !bare, detail: `left edge ${edge.join(",")}` });
          }
          // Per-block text colours must reach the PNG: the same creative without them must look different.
          if (!c.expectBlocked && c.fx.project.textColours && Object.keys(c.fx.project.textColours).length) {
            const plain = await exportCreative({ ...c.fx.project, textColours: {} }, c.images ?? c.fx.images);
            const d = await pixelDiff(blob, plain.blob);
            const detail = `${(d * 100).toFixed(2)}% of pixels differ from Auto`;
            // The Listing draws no text, so colours must change nothing there.
            checks.push(c.web === "website-listing" ? { name: "listing unaffected by text colours", pass: d === 0, detail } : { name: "text colours in PNG", pass: d > 0.0005, detail });
          }
          out.push({ key: c.key, label: c.label, url: URL.createObjectURL(blob), fileName: exportFileName(c.fx.project), checks });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          out.push({ key: c.key, label: c.label, expectBlocked: c.expectBlocked, checks: [c.expectBlocked ? { name: "refused", pass: e instanceof ExportError, detail: msg } : { name: "exported", pass: false, detail: msg }] });
        }
        setRows([...out]);
      }
      const failed = out.filter((r) => r.checks.some((x) => !x.pass)).map((r) => ({ key: r.key, failed: r.checks.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail ?? ""}`) }));
      window.__exportQA = { done: true, total: out.length, failed };
      setRunning(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  const failed = rows.filter((r) => r.checks.some((x) => !x.pass)).length;
  const shown = SHOW ? rows.find((r) => r.key === SHOW) : null;
  if (SHOW) return shown?.url ? <img src={shown.url} alt={shown.label} style={{ display: "block", width: "auto", maxWidth: "none" }} data-shown="true" /> : <p>{running ? "Exporting…" : `No export ${SHOW}`}</p>;
  return (
    <main className="qa qa--wide">
      <header className="qa-stack">
        <h1>Export · QA</h1>
        <p className="qa-muted">Real PNG exports through the same pipeline as the Download button. Each image is decoded and checked: exact size, square opaque corners, real content. Impossible creatives must be refused.</p>
        <p className={failed ? "qa-missing" : "qa-pass"} data-testid="export-summary">
          {running ? `Exporting… ${rows.length} done` : failed ? `${failed} of ${rows.length} exports failed` : `All ${rows.length} exports pass`}
        </p>
      </header>
      <div className="qa-block-grid">
        {rows.map((r) => (
          <figure key={r.key} className="qa-block" data-pass={String(!r.checks.some((x) => !x.pass))}>
            {r.url ? <img src={r.url} alt={r.label} style={{ width: r.key.includes("/feed/") ? 216 : 288, height: "auto", display: "block", boxShadow: "var(--shadow-card)" }} /> : <div className="qa-muted" style={{ width: 216 }}>No image (refused)</div>}
            <figcaption>
              <strong>{r.label}</strong>
              {r.fileName && <span className="qa-muted">{r.fileName}</span>}
              {r.checks.map((x) => (
                <span key={x.name} className={x.pass ? "qa-pass" : "qa-missing"}>
                  {x.pass ? "✓" : "✗"} {x.name}
                  {x.detail ? `: ${x.detail}` : ""}
                </span>
              ))}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
