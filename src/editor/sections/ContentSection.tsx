import type { ReactNode } from "react";
import type { EventContent, Project, TextRole } from "@/model/project";
import type { Edit } from "@/state/edits";
import { headlineLines } from "@/templates/shared/details";
import { designTextRoles } from "@/templates/textRoles";
import { ColourControl } from "../ColourControl";
import { Field, PanelSection } from "../PanelSection";

/** The text blocks each field feeds: its value, and its label where the design prints one. */
const FIELD_ROLES: Record<keyof EventContent, readonly TextRole[]> = {
  headline: ["headline"],
  subheader: ["subheader"],
  date: ["date", "date-label"],
  day: ["day"],
  time: ["time", "time-label"],
  venue: ["venue", "venue-label"],
  city: ["city"],
  notes: ["notes"],
};

const FIELDS: Array<{ key: Exclude<keyof EventContent, "headline" | "subheader">; label: string; hint?: string }> = [
  { key: "date", label: "Date", hint: "As you'd write it, e.g. day and month." },
  { key: "day", label: "Day (optional)" },
  { key: "time", label: "Time" },
  { key: "venue", label: "Venue" },
  { key: "city", label: "City" },
  { key: "notes", label: "Additional details (optional)", hint: "Level, price, what to bring." },
];

export function contentSummary(c: EventContent): string {
  const first = headlineLines(c.headline)[0];
  return [first, c.date.trim(), c.city.trim()].filter(Boolean).join(" · ") || "Nothing added yet";
}

/** Fields the Website Banner uses. Subheader and notes stay in the project but aren't shown there. */
export const BANNER_FIELDS: ReadonlyArray<keyof EventContent> = ["headline", "date", "day", "time", "venue", "city"];

/** Every field starts empty; anything left empty is left off the creative. */
export function ContentSection({ project, edit, open, onToggle, only, intro }: { project: Project; edit: (e: Edit) => void; open: boolean; onToggle: () => void; only?: ReadonlyArray<keyof EventContent>; intro?: string }) {
  const content = project.content;
  const shown = (k: keyof EventContent) => !only || only.includes(k);
  // Colour controls only for text this design actually draws.
  const design = new Set(designTextRoles(project));
  const colours = project.textColours ?? {};
  const withColour = (k: keyof EventContent, label: string, input: ReactNode) => (
    <div className="field-with-colour">
      {input}
      <ColourControl roles={FIELD_ROLES[k].filter((r) => design.has(r))} set={colours} edit={edit} field={label} />
    </div>
  );
  const set = (field: keyof EventContent) => (e: { target: { value: string } }) => edit({ type: "content", field, value: e.target.value });
  return (
    <PanelSection title="Content" summary={contentSummary(content)} open={open} onToggle={onToggle}>
      {intro && <p className="field-hint">{intro}</p>}
      <Field label={only ? "Event title (optional)" : "Event title"} hint="The name of the event, e.g. Saturday Morning Run. It sizes and wraps itself to stay in its space; press Enter only where you want a new line." htmlFor="field-headline">
        {withColour("headline", "Event title", <textarea id="field-headline" className="input input--headline" rows={2} value={content.headline} onChange={set("headline")} />)}
      </Field>
      {shown("subheader") && (
        <Field label="Subheader (optional)" hint="A short line above the name." htmlFor="field-subheader">
          {withColour("subheader", "Subheader", <input id="field-subheader" className="input" value={content.subheader} onChange={set("subheader")} />)}
        </Field>
      )}
      {FIELDS.filter((f) => shown(f.key)).map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`field-${f.key}`}>
          {withColour(f.key, f.label.replace(/ \(optional\)$/, ""), <input id={`field-${f.key}`} className="input" value={content[f.key]} onChange={set(f.key)} />)}
        </Field>
      ))}
      <p className="field-hint">Leave a field empty and it's left off the creative. The colour button beside a field sets that text's colour; Auto keeps the template's own.</p>
    </PanelSection>
  );
}
