import { OUTPUTS } from "@/model/outputs";
import type { Project } from "@/model/project";

/**
 * SIS_[City]_[Date]_[Template]_Instagram-Creative.png
 * SIS_[City]_[Date]_Website-Banner.png
 * SIS_[City]_[Date]_Website-Listing.png
 * e.g. SIS_Bangalore_12-Oct-2026_Broadsheet_Instagram-Creative.png
 * Missing city or date is left out (no placeholders). Safe on macOS and Windows.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TEMPLATE_NAMES = { broadsheet: "Broadsheet", poster: "Poster", block: "Block", slab: "Slab", ticket: "Ticket" } as const;

/** Reduce any text to a filename-safe token: letters, digits and hyphens only. */
export function safeToken(text: string, max = 40): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: "Thiruvananthapuram" stays, "Café" → "Cafe"
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Free-text date → "12-Oct-2026" when a day and month can be read. The year
 * is the one typed, or else the next time that day comes round (events are
 * upcoming). Anything unreadable falls back to a sanitised version of the text.
 */
export function dateToken(date: string, today: Date = new Date()): string {
  const text = date.trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const monthIndex = MONTHS.findIndex((m) => lower.includes(m.toLowerCase()));
  const day = Number((text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/i) ?? [])[1]);
  if (monthIndex < 0 || !day || day > 31) return safeToken(text, 24);
  const typedYear = Number((text.match(/\b(20\d{2})\b/) ?? [])[1]);
  let year = typedYear || today.getFullYear();
  if (!typedYear) {
    const candidate = new Date(year, monthIndex, day);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (candidate < startOfToday) year += 1;
  }
  return `${String(day).padStart(2, "0")}-${MONTHS[monthIndex]}-${year}`;
}

export function exportFileName(project: Project, today: Date = new Date()): string {
  const output = project.style.output ?? "instagram";
  const parts = [
    "SIS",
    safeToken(project.content.city, 30),
    dateToken(project.content.date, today),
    // Only Instagram Creatives use a template.
    output === "instagram" ? TEMPLATE_NAMES[project.style.template] : "",
    OUTPUTS[output].fileLabel,
  ].filter(Boolean);
  return `${parts.join("_")}.png`;
}
