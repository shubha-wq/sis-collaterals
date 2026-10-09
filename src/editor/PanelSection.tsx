import { useId, type ReactNode } from "react";

interface PanelSectionProps {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Collapsible panel section. Collapsed, it shows a one-line summary of what's set. */
export function PanelSection({ title, summary, open, onToggle, children }: PanelSectionProps) {
  const id = useId();
  return (
    <section className="panel-section">
      <button type="button" className="panel-section-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="panel-section-titles">
          <span className="panel-section-title">{title}</span>
          <span className="panel-section-summary">{summary}</span>
        </span>
        <span className="panel-section-caret" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={id} className="panel-section-body">
          {children}
        </div>
      )}
    </section>
  );
}

/** Label + control + hint. Pass `htmlFor` (the control's id) so the label is tied to it explicitly. */
export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
