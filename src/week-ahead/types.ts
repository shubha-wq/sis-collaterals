/**
 * Week Ahead data contract. Presentation never imports schedule data
 * directly; it receives a WeekSchedule from a ScheduleSource. V1 uses a
 * manual source; Google Calendar, Sheets, Airtable or an API can implement
 * the same interface later.
 */

export interface ScheduleEvent {
  name: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  time?: string;
  venue?: string;
  /** Shown in the accent colour with the "Special event" key. */
  special?: boolean;
  /** Included in multi-sport packages ("MS" badge). */
  multiSport?: boolean;
}

export interface WeekSchedule {
  city: string;
  /** ISO dates of the Tuesday–Sunday window. */
  start: string;
  end: string;
  events: ScheduleEvent[];
}

export interface ScheduleProvenance {
  source: string;
  updatedAt: string;
  covers: { start: string; end: string };
}

export interface ScheduleSource {
  cities(): Promise<string[]>;
  week(city: string, start: string): Promise<WeekSchedule>;
  provenance(): Promise<ScheduleProvenance>;
}
