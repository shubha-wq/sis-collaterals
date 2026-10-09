import type { EventContent } from "@/model/project";

export type DetailKey = "date" | "time" | "venue";

export interface DetailItem {
  key: DetailKey;
  label: string;
  value: string;
  /** Relative emphasis: the date decides whether someone can come, so it leads. */
  emphasis: number;
  /**
   * Date only: the value split into its date and day parts, so each can be
   * coloured on its own. Joined, they read exactly as `value`.
   */
  parts?: Array<{ role: "date" | "day"; text: string }>;
}

/** Date and day joined with a comma ("<date>, <day>"); either alone is fine. */
export function dateLine(content: Pick<EventContent, "date" | "day">): string {
  return [content.date, content.day].map((v) => v.trim()).filter(Boolean).join(", ");
}

/** Only filled fields become items, so empty ones leave no trace in the layout. */
export function detailItems(content: EventContent): DetailItem[] {
  const date = content.date.trim();
  const day = content.day.trim();
  const parts: DetailItem["parts"] = [
    ...(date ? [{ role: "date" as const, text: date + (day ? ", " : "") }] : []),
    ...(day ? [{ role: "day" as const, text: day }] : []),
  ];
  const items: DetailItem[] = [
    { key: "date", label: "Date", value: dateLine(content), emphasis: 1.08, parts },
    { key: "time", label: "Time", value: content.time.trim(), emphasis: 1 },
    { key: "venue", label: "Venue", value: content.venue.trim(), emphasis: 0.94 },
  ];
  return items.filter((i) => i.value !== "");
}

/** Headline lines as typed (Enter starts a new line); blank lines dropped. */
export function headlineLines(headline: string): string[] {
  return headline.split("\n").map((l) => l.trim()).filter(Boolean);
}
