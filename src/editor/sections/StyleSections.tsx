import { ACCENTS, ACCENT_ORDER, TEXT_COLOURS } from "@/design-system/brand";
import { color } from "@/design-system/tokens";
import type { BlockColour, HeadlineSize, PaperGround, Project, TextColour } from "@/model/project";
import type { Edit } from "@/state/edits";
import { AVAILABLE_TEMPLATES, findTemplate } from "@/templates/registry";
import { PanelSection } from "../PanelSection";

type SectionProps = { project: Project; edit: (e: Edit) => void; open: boolean; onToggle: () => void };

export function StyleSection({ project, edit, open, onToggle }: SectionProps) {
  const { style } = project;
  const summary = [findTemplate(style.template).label, ACCENTS[style.accent].label].join(" · ");
  return (
    <PanelSection title="Style" summary={summary} open={open} onToggle={onToggle}>
      <p className="label">Template · Instagram only</p>
      <div className="chips">
        {AVAILABLE_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={style.template === t.id} title={t.description} onClick={() => edit({ type: "style", style: { template: t.id } })}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="label">Colour</p>
      <div className="swatches">
        {ACCENT_ORDER.map((id) => (
          <button key={id} type="button" className="swatch" title={ACCENTS[id].label} aria-label={ACCENTS[id].label} aria-pressed={style.accent === id} style={{ background: color(ACCENTS[id].token) }} onClick={() => edit({ type: "style", style: { accent: id } })} />
        ))}
      </div>
      <p className="field-hint">Text colour is picked automatically so it stays readable.</p>
    </PanelSection>
  );
}

const DETAIL_LABEL = { cards: "Cards", rows: "Rows", tags: "Tags", ledger: "Ledger", inline: "Inline" } as const;

/** Read-only: each template has one detail treatment chosen for its design. */
export function DetailsSection({ project, open, onToggle }: Omit<SectionProps, "edit">) {
  const t = findTemplate(project.style.template);
  return (
    <PanelSection title="Details" summary={DETAIL_LABEL[t.recommendedDetailStyle]} open={open} onToggle={onToggle}>
      <p className="field-hint">
        {t.detailsDescription} Empty fields are left out. Each template has its own detail style, so it changes when you change template.
      </p>
    </PanelSection>
  );
}

const HEADLINE_SIZES: Array<[HeadlineSize, string]> = [["auto", "Auto"], ["small", "Small"], ["large", "Large"]];
const PAPER_GROUNDS: Array<[PaperGround, string]> = [["paper", "Paper"], ["tint", "Tint"], ["accent", "Colour"]];
const BLOCK_COLOURS: Array<[BlockColour, string]> = [["accent", "Colour"], ["ink", "Ink"]];

export function FineTuneSection({ project, edit, open, onToggle }: SectionProps) {
  const o = project.overrides;
  const changed = Object.keys(o).length > 0;
  return (
    <PanelSection title="Fine-tune" summary={changed ? "Manual adjustments on" : "Optional adjustments"} open={open} onToggle={onToggle}>
      <p className="label">Event title size</p>
      <div className="chips">
        {HEADLINE_SIZES.map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={(o.headlineSize ?? "auto") === k} onClick={() => edit({ type: "overrides", overrides: { headlineSize: k } })}>
            {l}
          </button>
        ))}
      </div>
      <p className="label">All text colour</p>
      <div className="chips">
        {(Object.keys(TEXT_COLOURS) as TextColour[]).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={(o.textColour ?? "auto") === k} onClick={() => edit({ type: "overrides", overrides: { textColour: k } })}>
            {TEXT_COLOURS[k].label}
          </button>
        ))}
      </div>
      {project.style.template === "broadsheet" && (
        <>
          <p className="label">Background</p>
          <div className="chips">
            {PAPER_GROUNDS.map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={(o.paperGround ?? "paper") === k} onClick={() => edit({ type: "overrides", overrides: { paperGround: k } })}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
      {project.style.template === "slab" && (
        <>
          <p className="label">Slab colour</p>
          <div className="chips">
            {BLOCK_COLOURS.map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={(o.blockColour ?? "accent") === k} onClick={() => edit({ type: "overrides", overrides: { blockColour: k } })}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="label">Logo size · {Math.round((o.logoScale ?? 1) * 100)}%</p>
      <input id="field-logo-scale" type="range" min={0.6} max={1.6} step={0.05} value={o.logoScale ?? 1} onChange={(e) => edit({ type: "overrides", overrides: { logoScale: Number(e.target.value) } })} />
      <button type="button" className="chip" onClick={() => edit({ type: "reset-to-auto" })}>
        Reset to Auto
      </button>
      <p className="field-hint">Reset to Auto removes manual adjustments (including background, slab colour and text colours) and photo framing. It never changes your content. To colour one piece of text, use Text colours.</p>
    </PanelSection>
  );
}
