import type { OutputId } from "@/model/outputs";
import type { TemplateId } from "@/model/project";
import type { CreativeSummary } from "./types";

/**
 * Library search and filters. Pure, so the list behaves the same whatever
 * backend it came from. Dates use when a creative was last saved.
 */

export type DateRange = "7d" | "30d" | "90d" | "all";
export const DEFAULT_RANGE: DateRange = "30d";
export const RANGE_LABELS: Record<DateRange, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };
const RANGE_DAYS: Record<DateRange, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

export interface LibraryFilters {
  search: string;
  city: string | "all";
  output: OutputId | "all";
  template: TemplateId | "all";
  range: DateRange;
}

export const EMPTY_FILTERS: LibraryFilters = { search: "", city: "all", output: "all", template: "all", range: DEFAULT_RANGE };

/** Start of the range: midnight, `days` days before today (so "30 days" is whole calendar days). */
export function rangeStart(range: DateRange, now: Date = new Date()): string | undefined {
  const days = RANGE_DAYS[range];
  if (days === null) return undefined;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterCreatives(list: readonly CreativeSummary[], f: LibraryFilters, now: Date = new Date()): CreativeSummary[] {
  const since = rangeStart(f.range, now);
  const terms = norm(f.search).split(/\s+/).filter(Boolean);
  return list
    .filter((c) => !since || c.updatedAt >= since)
    .filter((c) => f.city === "all" || norm(c.city) === norm(f.city))
    .filter((c) => f.output === "all" || c.output === f.output)
    .filter((c) => f.template === "all" || (c.output === "instagram" && c.template === f.template))
    .filter((c) => {
      if (!terms.length) return true;
      const hay = norm([c.headline, c.venue, c.city].join(" "));
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** Distinct cities for the City filter, as most often written. */
export function citiesIn(list: readonly CreativeSummary[]): string[] {
  const byKey = new Map<string, string>();
  for (const c of list) {
    const city = c.city.trim();
    if (city && !byKey.has(norm(city))) byKey.set(norm(city), city);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** Groups by the local calendar day the creative was last saved, newest first. */
export function groupByDay(list: readonly CreativeSummary[]): Array<{ day: string; items: CreativeSummary[] }> {
  const groups: Array<{ day: string; items: CreativeSummary[] }> = [];
  for (const c of list) {
    const d = new Date(c.updatedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(c);
    else groups.push({ day: key, items: [c] });
  }
  return groups;
}
