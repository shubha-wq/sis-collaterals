import { ACCENTS, ACCENT_ORDER } from "@/design-system/brand";
import { Wordmark } from "@/design-system/components/Wordmark";
import { COLORS, color, contrastRatio, type ColorToken } from "@/design-system/tokens";
import { BUILTIN_LOGOS, BUILTIN_PHOTOS } from "@/assets/catalog";
import { FORMATS } from "@/model/formats";
import { TEMPLATES } from "@/templates/registry";
import { LogoLibraryCheck } from "./LogoLibraryCheck";
import "./qa.css";

const PALETTE: ColorToken[] = ["coral", "teal", "royal-blue", "yellow-deep", "coral-salmon", "ink", "ink-soft", "stone", "paper", "paper-warm", "paper-edge", "white"];

/**
 * Developer-only QA. Phase 2: design system and asset checks. Template ×
 * fixture grids arrive with the templates (see docs/EDGE_CASES.md).
 */
export function QAPage() {
  return (
    <main className="qa">
      <header className="qa-stack">
        <Wordmark size={28} />
        <h1>QA</h1>
        <p className="qa-muted">
          {TEMPLATES.length} templates × {Object.keys(FORMATS).length} formats registered. No templates are built yet.
        </p>
      </header>

      <section className="qa-stack">
        <h2>Colour</h2>
        <div className="qa-grid">
          {PALETTE.map((t) => (
            <div key={t} className="qa-swatch">
              <div style={{ background: color(t) }} />
              <span>{t}</span>
              <span className="qa-muted">{COLORS[t]}</span>
            </div>
          ))}
        </div>
        <h3>Accents and their text colour</h3>
        <div className="qa-row">
          {ACCENT_ORDER.map((id) => {
            const a = ACCENTS[id];
            return (
              <div key={id} className="qa-accent" style={{ background: color(a.token), color: color(a.on) }}>
                <strong>{a.label}</strong>
                <span>{contrastRatio(COLORS[a.token], COLORS[a.on]).toFixed(1)}:1</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="qa-stack">
        <h2>Type</h2>
        <p className="qa-display">Padel Coaching Workshop</p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-lead)", fontWeight: "var(--fw-bold)" }}>10th October, Saturday · 4:00–7:00 PM · Hive Club</p>
        <p style={{ fontFamily: "var(--font-body)" }}>Inter Tight 300 <b style={{ fontWeight: 400 }}>400</b> <b style={{ fontWeight: 600 }}>600</b> <b style={{ fontWeight: 700 }}>700</b> <i>italic</i> · Śrī Ñandi Øresund</p>
        <p style={{ fontFamily: "var(--font-accent)", fontSize: 28 }}>Sistra Run</p>
        <p className="qa-muted">All faces load from this app's own files; no Google Fonts request.</p>
      </section>

      <section className="qa-stack">
        <h2>Built-in logos</h2>
        <div className="qa-logo-row qa-checker">
          {BUILTIN_LOGOS.map((l) => (
            <div key={l.id} className="qa-logo-cell">
              <img src={l.url} alt={l.label} style={{ height: 64 }} />
              <span>{l.label} · {l.role === "sis" ? "required" : "partner"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="qa-stack">
        <h2>Photo library · {BUILTIN_PHOTOS.length}</h2>
        <div className="qa-grid">
          {BUILTIN_PHOTOS.map((p) => (
            <figure key={p.id} className="qa-photo">
              <img src={p.url} alt={p.label} loading="lazy" />
              <figcaption>{p.label} <span className="qa-muted">{p.width} × {p.height}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="qa-stack">
        <h2>Logo library</h2>
        <LogoLibraryCheck />
      </section>
    </main>
  );
}
