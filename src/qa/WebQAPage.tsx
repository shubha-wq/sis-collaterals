import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OUTPUTS } from "@/model/outputs";
import { webFraming } from "@/model/webFraming";
import { HEADLINE_FLOOR } from "@/templates/shared/kit";
import { rendererFor } from "@/templates/outputs";
import { reviewProject } from "@/validation/projectChecks";
import { runLayoutChecks, type CheckResult } from "./layoutChecks";
import { webFixtures, type WebFixture } from "./templateFixtures";
import { runWebChecks } from "./webChecks";
import { runTextColourChecks } from "./textColourChecks";
import "./qa.css";

declare global {
  interface Window {
    __webQA?: { done: boolean; total: number; failed: Array<{ id: string; checks: CheckResult[] }> };
  }
}

const params = new URLSearchParams(window.location.search);
const ONLY = params.get("only")?.split(",").filter(Boolean) ?? null;
const ONLY_OUTPUT = params.get("output");
const SCALE = Number(params.get("scale")) || 0.18;
const BARE = params.get("bare") === "1";
/** Website Banner headline base (canvas units) × landscape factor, for the floor check. */
const BANNER_HEADLINE_FLOOR_PX = 64 * HEADLINE_FLOOR * 0.94;

/**
 * Developer-only QA for the website outputs (/qa/web): every fixture
 * rendered as exported, with the shared layout checks (Banner) plus the
 * website checks: exact size, photo never stretched, crop / whole-photo
 * rule, arc colour, anchoring and containment, Listing has no arc, text or logos.
 */
export function WebQAPage() {
  const [results, setResults] = useState<Record<string, CheckResult[]>>({});
  const refs = useRef(new Map<string, HTMLDivElement>());
  const outputs = (["website-banner", "website-listing"] as const).filter((o) => !ONLY_OUTPUT || o === ONLY_OUTPUT);
  const cases = useMemo(() => outputs.flatMap((o) => webFixtures(o).filter((f) => !ONLY || ONLY.includes(f.id)).map((fx) => ({ key: `${o}/${fx.id}`, fx }))), []);

  const run = useCallback(async () => {
    await document.fonts.ready;
    // Wait for the photo layers (edge extensions) and images.
    const deadline = performance.now() + 20_000;
    while (performance.now() < deadline && (document.querySelector('[data-pending="true"]') || [...document.querySelectorAll("img")].some((i) => !i.complete))) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    const next: Record<string, CheckResult[]> = {};
    for (const c of cases) {
      const root = refs.current.get(c.key)?.querySelector<HTMLElement>("[data-template]");
      if (!root) continue;
      const { fx } = c;
      const reportedCannotFit = root.dataset.fit === "cannot-fit";
      const source = fx.images.photo.state === "ready" ? fx.images.photo.image : null;
      const web = runWebChecks(root, { output: fx.output, source, framing: webFraming(fx.project, fx.output, source), reportedCannotFit, landscape: fx.landscape });
      const shared =
        fx.output === "website-banner"
          ? runLayoutChecks(root, { partners: fx.partners, expectCannotFit: fx.expectCannotFit, mustNotFit: fx.mustNotFit, headlineFloorPx: BANNER_HEADLINE_FLOOR_PX, width: 1600, height: 1000 })
          : [];
      // Review: a website output without a photo can't be downloaded.
      const issues = reviewProject(fx.project, fx.images, { status: reportedCannotFit ? "cannot-fit" : "fits", step: 0 });
      const review = { name: "photo required", pass: source ? !issues.some((i) => i.id === "photo-required") : issues.some((i) => i.id === "photo-required" && i.level === "blocking") };
      // Download waits for the AI landscape; the fallback only warns.
      const blocks = (id: string) => issues.some((i) => i.id === id && i.level === "blocking");
      const gate =
        fx.landscape === "pending"
          ? { name: "download blocked while generating", pass: blocks("expansion-pending") }
          : fx.landscape === "failed"
            ? { name: "download blocked after failure", pass: blocks("expansion-failed") }
            : fx.landscape === "unavailable"
              ? { name: "fallback warns, doesn't block", pass: !issues.some((i) => i.id.startsWith("expansion-") && i.level === "blocking") && issues.some((i) => i.id === "expansion-unavailable") }
              : { name: "no landscape issues when ready", pass: !issues.some((i) => i.id.startsWith("expansion-")) };
      next[c.key] = [...shared, ...web, review, gate, ...runTextColourChecks(root, fx.project, fx.expectLowContrast)];
    }
    setResults(next);
    const failed = Object.entries(next).filter(([, r]) => r.some((x) => !x.pass)).map(([id, checks]) => ({ id, checks: checks.filter((x) => !x.pass) }));
    window.__webQA = { done: true, total: Object.keys(next).length, failed };
  }, [cases]);

  useEffect(() => {
    window.__webQA = { done: false, total: 0, failed: [] };
    const t = setTimeout(() => void run(), 800);
    return () => clearTimeout(t);
  }, [run]);

  const all = Object.values(results);
  const failedCount = all.filter((r) => r.some((x) => !x.pass)).length;
  return (
    <main className={BARE ? "qa qa--wide qa--bare" : "qa qa--wide"}>
      <header className="qa-stack">
        <h1>Website outputs · QA</h1>
        <p className="qa-muted">{cases.length} cases. Filter with ?output=website-banner and ?only=web-all; enlarge with ?scale=0.4.</p>
        <p className={failedCount ? "qa-missing" : "qa-pass"} data-testid="qa-summary">
          {all.length === 0 ? "Running checks…" : failedCount ? `${failedCount} of ${all.length} cases have failures` : `All ${all.length} cases pass`}
        </p>
      </header>
      {outputs.map((o) => (
        <section key={o} className="qa-stack">
          <h2>{OUTPUTS[o].label} · 1600 × 1000</h2>
          <div className="qa-block-grid">
            {cases.filter((c) => c.fx.output === o).map((c) => (
              <Case key={c.key} fx={c.fx} results={results[c.key]} register={(el) => el && refs.current.set(c.key, el)} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function Case({ fx, results, register }: { fx: WebFixture; results?: CheckResult[]; register: (el: HTMLDivElement | null) => void }) {
  const { Component } = rendererFor(fx.project);
  const failed = results?.filter((r) => !r.pass) ?? [];
  return (
    <figure className="qa-block" data-pass={results ? String(failed.length === 0) : undefined}>
      <div ref={register} style={{ width: 1600 * SCALE, height: 1000 * SCALE, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <div style={{ width: 1600, height: 1000, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>{Component && <Component project={fx.project} images={fx.images} mode="export" />}</div>
      </div>
      <figcaption>
        <strong>{fx.label}</strong>
        {!results && <span className="qa-muted">…</span>}
        {results && failed.length === 0 && <span className="qa-pass">✓ {results.length} checks</span>}
        {failed.map((r) => (
          <span key={r.name} className="qa-missing">✗ {r.name}{r.detail ? `: ${r.detail}` : ""}</span>
        ))}
      </figcaption>
    </figure>
  );
}
