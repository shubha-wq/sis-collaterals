import type { Project, TemplateId, TextRole } from "@/model/project";

/**
 * Which text blocks each design actually renders, in panel order. Only
 * these get Text colour controls. Ledger, Inline and Tags show no field
 * labels; Cards, Rows and the Website Banner do.
 */
const WITH_LABELS: readonly TextRole[] = ["headline", "subheader", "date-label", "date", "day", "time-label", "time", "venue-label", "venue", "city", "notes"];
const NO_LABELS: readonly TextRole[] = ["headline", "subheader", "date", "day", "time", "venue", "city", "notes"];

export const TEMPLATE_TEXT_ROLES: Record<TemplateId, readonly TextRole[]> = {
  broadsheet: NO_LABELS,
  poster: NO_LABELS,
  block: WITH_LABELS,
  slab: WITH_LABELS,
  ticket: NO_LABELS,
};

/** The Banner draws the headline, the Date / Time / Venue lines (label + value) and the city. */
export const BANNER_TEXT_ROLES: readonly TextRole[] = ["headline", "date-label", "date", "day", "time-label", "time", "venue-label", "venue", "city"];

export const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  headline: "Event title",
  subheader: "Subheader",
  date: "Date",
  day: "Day",
  time: "Time",
  venue: "Venue",
  "date-label": "Date label",
  "time-label": "Time label",
  "venue-label": "Venue label",
  city: "City",
  notes: "Additional details",
};

/** Every text block the current design can render (whether or not it has content yet). */
export function designTextRoles(project: Project): readonly TextRole[] {
  const output = project.style.output ?? "instagram";
  if (output === "website-listing") return [];
  return output === "website-banner" ? BANNER_TEXT_ROLES : TEMPLATE_TEXT_ROLES[project.style.template];
}

/** The text blocks on this creative right now: rendered by its design and with content to show. */
export function textRolesFor(project: Project): TextRole[] {
  const output = project.style.output ?? "instagram";
  if (output === "website-listing") return [];
  const roles = output === "website-banner" ? BANNER_TEXT_ROLES : TEMPLATE_TEXT_ROLES[project.style.template];
  const c = project.content;
  const has = (v: string) => v.trim() !== "";
  const present: Record<TextRole, boolean> = {
    headline: has(c.headline),
    subheader: has(c.subheader),
    date: has(c.date),
    day: has(c.day),
    "date-label": has(c.date) || has(c.day),
    time: has(c.time),
    "time-label": has(c.time),
    venue: has(c.venue),
    "venue-label": has(c.venue),
    city: has(c.city),
    notes: has(c.notes),
  };
  return roles.filter((r) => present[r]);
}
