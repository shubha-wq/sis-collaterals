import type { ImageSource } from "./assets";
import { DEFAULT_FORMAT } from "./formats";
import { DEFAULT_OUTPUT, OUTPUTS } from "./outputs";
import { SCHEMA_VERSION, type EventContent, type Project, type StyleSettings } from "./project";

/**
 * The only way the app creates a project. It is genuinely empty: no text,
 * no photo, no partner logo. The SIS logo is not part of project content;
 * every template draws it.
 */

export const EMPTY_CONTENT: Readonly<EventContent> = Object.freeze({
  headline: "",
  subheader: "",
  date: "",
  day: "",
  time: "",
  venue: "",
  city: "",
  notes: "",
});

export const DEFAULT_STYLE: Readonly<StyleSettings> = Object.freeze({
  output: DEFAULT_OUTPUT,
  // Block is the first template built; switch back to Broadsheet once it exists.
  template: "block",
  format: DEFAULT_FORMAT,
  accent: "coral",
  detailStyle: "auto",
});

/**
 * Tool settings that may carry into the next new creative. Deliberately
 * limited to presentation choices; nothing event-specific.
 */
export type CarriedSettings = Pick<StyleSettings, "output" | "template" | "format">;

export function createBlankProject(id: string, now: Date = new Date(), carry?: Partial<CarriedSettings>): Project {
  const stamp = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: "",
    createdAt: stamp,
    updatedAt: stamp,
    content: { ...EMPTY_CONTENT },
    photo: { source: null, focusX: 50, focusY: 50, zoom: 1 },
    logos: { partners: [], background: "none" },
    style: { ...DEFAULT_STYLE, ...carry },
    overrides: {},
  };
}

export function newProjectId(): string {
  return "proj-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/** True when the person hasn't added anything event-specific yet. */
export function hasEventContent(project: Project): boolean {
  const textFilled = (Object.keys(EMPTY_CONTENT) as (keyof EventContent)[]).some((k) => project.content[k].trim() !== "");
  return textFilled || project.photo.source !== null || project.logos.partners.length > 0;
}

/** Name shown in the drafts list: the saved name, else the headline's first line. */
export function displayName(project: Project): string {
  const firstLine = project.content.headline.split("\n").map((l) => l.trim()).find(Boolean);
  return project.name.trim() || firstLine || "Untitled creative";
}

export function sourcesEqual(a: ImageSource | null, b: ImageSource | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "builtin" && b.kind === "builtin") return a.id === b.id;
  if (a.kind === "upload" && b.kind === "upload") return a.blobId === b.blobId;
  return false;
}

/**
 * Brings a stored project up to the current shape. Drafts saved before the
 * output types existed are Instagram Creatives; an Instagram Creative is
 * always the 1080 × 1350 feed composition.
 */
export function normalizeProject(p: Project): Project {
  const output = p.style.output && p.style.output in OUTPUTS ? p.style.output : DEFAULT_OUTPUT;
  const format = output === "instagram" ? "feed" : p.style.format;
  if (output === p.style.output && format === p.style.format) return p;
  return { ...p, style: { ...p.style, output, format } };
}
