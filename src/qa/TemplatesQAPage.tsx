import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unitFor } from "@/layout/canvas";
import { FORMATS } from "@/model/formats";
import type { TemplateId } from "@/model/project";
import { HEADLINE_FLOOR } from "@/templates/shared/kit";
import { TEMPLATES } from "@/templates/registry";
import { templateFixtures, type TemplateFixture } from "./templateFixtures";
import { runLayoutChecks, type CheckResult } from "./layoutChecks";
import { runTextColourChecks } from "./textColourChecks";
import "./qa.css";

type Results = Record<string, CheckResult[]>;

declare global {
  interface Window {
    __templateQA?: { done: boolean; total: number; byTemplate: Record<string, { total: number; failed: number }>; failed: Array<{ id: string; checks: CheckResult[] }> };
    /** Kept for scripts written against the Block-only matrix. */
    __blockQA?: Window["__templateQA"];
  }
}

/** Base headline size per template, for the floor check. */
const HEADLINE_BASE: Record<TemplateId, number> = { block: 100, broadsheet: 104, poster: 118, slab: 94, ticket: 86 };

const params = new URLSearchParams(window.location.search);
/** ?template=slab,ticket limits templates; ?only=normal,long-venue limits fixtures; ?scale=0.5 enlarges. */
const ONLY_TEMPLATES = params.get("template")?.split(",").filter(Boolean) ?? null;
const ONLY = params.get("only")?.split(",").filter(Boolean) ?? null;
const ZOOM = Number(params.get("scale")) || 0;
/** ?format=feed or ?format=banner shows one format only. */
const ONLY_FORMAT = params.get("format");
/** ?bare=1 hides headings and captions (for visual review screenshots). */
const BARE = params.get("bare") === "1";
const SCALE = { feed: ZOOM || 0.24, banner: ZOOM ? ZOOM * 0.8 : 0.19 } as const;

/**
 * Developer-only QA matrix for every template: each fixture in feed and
 * banner, rendered exactly as exported, with automated geometry checks.
 * Results are exposed on window.__templateQA for scripted runs.
 */
export function TemplatesQAPage({ templateFilter }: { templateFilter?: TemplateId[] }) {
  const [results, setResults] = useState<Results>({});
  const refs = useRef(new Map<string, HTMLDivElement>());
  const templates = useMemo(
    () => TEMPLATES.filter((t) => t.component && (!(templateFilter ?? ONLY_TEMPLATES) || (templateFilter ?? ONLY_TEMPLATES)!.includes(t.id))),
    [templateFilter],
  );
  const cases = useMemo(
    () =>
      templates.flatMap((t) =>
        (["feed", "banner"] as const).filter((f) => !ONLY_FORMAT || f === ONLY_FORMAT).flatMap((f) =>
          templateFixtures(t.id, f).filter((fx) => !ONLY || ONLY.includes(fx.id)).map((fx) => ({ key: `${t.id}/${f}/${fx.id}`, template: t.id, format: f, fx })),
        ),
      ),
    [templates],
  );

  const run = useCallback(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll<HTMLImageElement>(".qa-block img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    await new Promise((r) => setTimeout(r, 400));
    const next: Results = {};
    for (const c of cases) {
      const root = refs.current.get(c.key)?.querySelector<HTMLElement>("[data-template]");
      if (!root) continue;
      const f = FORMATS[c.format];
      const floorPx = HEADLINE_BASE[c.template] * HEADLINE_FLOOR * unitFor(f.width, f.height) * (c.format === "feed" ? 1 : 0.94);
      next[c.key] = [
        ...runLayoutChecks(root, { partners: c.fx.partners, expectCannotFit: c.fx.expectCannotFit, mustNotFit: c.fx.mustNotFit, headlineFloorPx: floorPx, width: f.width, height: f.height }),
        ...runTextColourChecks(root, c.fx.project, c.fx.expectLowContrast),
      ];
    }
    setResults(next);
    const failed = Object.entries(next).filter(([, r]) => r.some((x) => !x.pass)).map(([id, checks]) => ({ id, checks: checks.filter((x) => !x.pass) }));
    const byTemplate: Record<string, { total: number; failed: number }> = {};
    for (const key of Object.keys(next)) {
      const t = key.split("/")[0]!;
      byTemplate[t] ??= { total: 0, failed: 0 };
      byTemplate[t].total += 1;
      if (next[key]!.some((x) => !x.pass)) byTemplate[t].failed += 1;
    }
    window.__templateQA = window.__blockQA = { done: true, total: Object.keys(next).length, byTemplate, failed };
  }, [cases]);

  useEffect(() => {
    window.__templateQA = window.__blockQA = { done: false, total: 0, byTemplate: {}, failed: [] };
    const t = setTimeout(() => void run(), 800);
    return () => clearTimeout(t);
  }, [run]);

  const all = Object.values(results);
  const failedCount = all.filter((r) => r.some((x) => !x.pass)).length;

  return (
    <main className={BARE ? "qa qa--wide qa--bare" : "qa qa--wide"}>
      <header className="qa-stack">
        <h1>Templates · QA matrix</h1>
        <p className="qa-muted">
          {cases.length} cases across {templates.length} template{templates.length === 1 ? "" : "s"}, feed and banner, rendered exactly as exported. Filter with ?template=slab,ticket and ?only=normal,long-venue; enlarge with ?scale=0.5.
        </p>
        <p className={failedCount ? "qa-missing" : "qa-pass"} data-testid="qa-summary">
          {all.length === 0 ? "Running checks…" : failedCount ? `${failedCount} of ${all.length} cases have failures` : `All ${all.length} cases pass`}
        </p>
        <button type="button" className="qa-chip" onClick={() => void run()}>Run checks again</button>
      </header>
      {templates.map((t) =>
        (["feed", "banner"] as const).filter((f) => !ONLY_FORMAT || f === ONLY_FORMAT).map((format) => (
          <section key={`${t.id}-${format}`} className="qa-stack">
            <h2>{t.label} · {format === "feed" ? "Feed 1080 × 1350" : "Banner 1600 × 1000"}</h2>
            <div className="qa-block-grid" data-format={format} data-template={t.id}>
              {cases.filter((c) => c.template === t.id && c.format === format).map((c) => (
                <Case key={c.key} fx={c.fx} template={t.id} format={format} results={results[c.key]} register={(el) => el && refs.current.set(c.key, el)} />
              ))}
            </div>
          </section>
        )),
      )}
    </main>
  );
}

function Case({ fx, template, format, results, register }: { fx: TemplateFixture; template: TemplateId; format: "feed" | "banner"; results?: CheckResult[]; register: (el: HTMLDivElement | null) => void }) {
  const f = FORMATS[format];
  const s = SCALE[format];
  const Component = TEMPLATES.find((t) => t.id === template)!.component!;
  const failed = results?.filter((r) => !r.pass) ?? [];
  return (
    <figure className="qa-block" data-pass={results ? String(failed.length === 0) : undefined}>
      <div ref={register} style={{ width: f.width * s, height: f.height * s, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <div style={{ width: f.width, height: f.height, transform: `scale(${s})`, transformOrigin: "top left" }}>
          <Component project={fx.project} images={fx.images} mode="export" />
        </div>
      </div>
      <figcaption>
        <strong>{fx.label}</strong>
        {!results && <span className="qa-muted">…</span>}
        {results && failed.length === 0 && <span className="qa-pass">✓ {results.length} checks</span>}
        {failed.map((r) => (
          <span key={r.name} className="qa-missing">✗ {r.name}{r.detail ? `: ${r.detail}` : ""}</span>
        ))}
        {results?.find((r) => r.name === "fit")?.detail && <span className="qa-muted">{results.find((r) => r.name === "fit")!.detail}</span>}
      </figcaption>
    </figure>
  );
}
