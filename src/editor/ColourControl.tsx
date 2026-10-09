import { useEffect, useId, useRef, useState } from "react";
import { TEXT_COLOURS } from "@/design-system/brand";
import { color } from "@/design-system/tokens";
import type { TextColour, TextColourChoice, TextRole } from "@/model/project";
import type { Edit } from "@/state/edits";
import { TEXT_ROLE_LABELS } from "@/templates/textRoles";

const CHOICES = (Object.keys(TEXT_COLOURS) as TextColour[]).filter((k): k is TextColourChoice => k !== "auto");

/**
 * The compact colour control beside a Content field. The button shows the
 * field's colour (an "A" while it is Auto); it opens a small popover with
 * Auto plus the approved text palette for each text block the field feeds
 * (e.g. Venue and, where the design shows labels, Venue label). Each block
 * is set independently; Auto removes its override.
 */
export function ColourControl({ roles, set, edit, field }: { roles: readonly TextRole[]; set: Partial<Record<TextRole, TextColourChoice>>; edit: (e: Edit) => void; field: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const popId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!roles.length) return null;

  const main = roles[0]!;
  const mainChoice = set[main];
  const changed = roles.filter((r) => set[r]);
  const summary = roles.map((r) => `${TEXT_ROLE_LABELS[r]}: ${set[r] ? TEXT_COLOURS[set[r]!].label : "Auto"}`).join(", ");
  return (
    <div className="colour-control" ref={wrap}>
      <button
        type="button"
        className="colour-control-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`${field} text colour (${summary})`}
        title={`Text colour · ${summary}`}
        data-changed={changed.length ? "true" : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {mainChoice ? <span className="colour-control-dot" style={{ background: color(TEXT_COLOURS[mainChoice].token!) }} /> : <span className="colour-control-auto" aria-hidden="true">A</span>}
        {roles.slice(1).some((r) => set[r]) && <span className="colour-control-sub" aria-hidden="true" style={{ background: color(TEXT_COLOURS[set[roles.find((r, i) => i > 0 && set[r])!]!].token!) }} />}
      </button>
      {open && (
        <div className="colour-popover" id={popId} role="dialog" aria-label={`${field} text colour`}>
          {roles.map((role) => {
            const label = TEXT_ROLE_LABELS[role];
            const current = set[role] ?? "auto";
            return (
              <div key={role} className="colour-popover-row" role="radiogroup" aria-label={`${label} colour`} data-role={role}>
                {roles.length > 1 && <span className="colour-popover-name">{label}</span>}
                <span className="colour-popover-options">
                  <button type="button" role="radio" aria-checked={current === "auto"} className="text-colour-auto" aria-label={`${label}: Auto (template colour)`} title="Auto: the template's colour" onClick={() => edit({ type: "text-colour", role, colour: "auto" })}>
                    Auto
                  </button>
                  {CHOICES.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={current === k}
                      className="text-colour-swatch"
                      aria-label={`${label}: ${TEXT_COLOURS[k].label}`}
                      title={TEXT_COLOURS[k].label}
                      style={{ background: color(TEXT_COLOURS[k].token!) }}
                      onClick={() => edit({ type: "text-colour", role, colour: k })}
                    />
                  ))}
                </span>
              </div>
            );
          })}
          {changed.length > 0 && (
            <button type="button" className="link-button colour-popover-reset" onClick={() => changed.forEach((role) => edit({ type: "text-colour", role, colour: "auto" }))}>
              Reset to Auto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
