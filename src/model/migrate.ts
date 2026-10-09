import { EMPTY_CONTENT, normalizeProject } from "./blank";
import { DEFAULT_FORMAT, FORMATS } from "./formats";
import { OUTPUTS } from "./outputs";
import { SCHEMA_VERSION, type EventContent, type Project } from "./project";

/**
 * Reading saved creatives safely, whatever version of the app saved them.
 *
 * - Never destructive: the stored record is not changed by reading it. A
 *   migrated draft is written back only when the person edits it (autosave),
 *   and then as a superset of what was there.
 * - Missing fields get safe defaults; unknown fields are kept (so a field
 *   added by a newer version survives an older tab's edit).
 * - Anything that can't be read safely is reported (DraftReadError) instead
 *   of being replaced with a blank creative. The original stays in storage.
 *
 * Schema history
 *   1  original shape (content, photo, logos, style, overrides)
 *   2  + style.output and website framing, text colours, library link,
 *      AI landscape: all optional or defaulted, so 1 → 2 only fills defaults
 * Add a step to STEPS (and bump SCHEMA_VERSION) for any future change.
 */

export type MigrationResult =
  | { ok: true; project: Project; from: number; changed: boolean }
  | { ok: false; reason: string; from: number | null };

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

const TEMPLATES = ["broadsheet", "poster", "block", "slab", "ticket"] as const;
const ACCENTS = ["coral", "teal", "royal-blue", "golden-yellow", "salmon"] as const;
const BACKGROUNDS = ["none", "paper", "white", "accent"] as const;

/** Version steps. Each takes the previous version's shape and returns the next. */
const STEPS: Record<number, (p: Raw) => Raw> = {
  // 1 → 2: everything new in 2 is optional or defaulted below; nothing is renamed or removed.
  1: (p) => ({ ...p, schemaVersion: 2 }),
};

function withDefaults(p: Raw, now: string): Project {
  const content = isObj(p.content) ? p.content : {};
  const photo = isObj(p.photo) ? p.photo : {};
  const logos = isObj(p.logos) ? p.logos : {};
  const style = isObj(p.style) ? p.style : {};
  const source = isObj(photo.source) && (photo.source.kind === "builtin" || photo.source.kind === "upload") ? (photo.source as unknown as Project["photo"]["source"]) : null;
  const partners = Array.isArray(logos.partners)
    ? (logos.partners.filter((l) => isObj(l) && typeof l.id === "string" && isObj(l.source)) as unknown as Project["logos"]["partners"])
    : [];
  const fullContent = Object.fromEntries((Object.keys(EMPTY_CONTENT) as (keyof EventContent)[]).map((k) => [k, str(content[k])])) as unknown as EventContent;
  return {
    ...(p as object), // keep unknown fields
    schemaVersion: SCHEMA_VERSION,
    id: str(p.id),
    name: str(p.name),
    createdAt: str(p.createdAt, now),
    updatedAt: str(p.updatedAt, str(p.createdAt, now)),
    content: { ...(content as object), ...fullContent },
    photo: { ...(photo as object), source, focusX: num(photo.focusX, 50, 0, 100), focusY: num(photo.focusY, 50, 0, 100), zoom: num(photo.zoom, 1, 1, 2.5) },
    logos: { ...(logos as object), partners: partners.slice(0, 4), background: oneOf(logos.background, BACKGROUNDS, "none") },
    style: {
      ...(style as object),
      output: oneOf(style.output, Object.keys(OUTPUTS) as Array<keyof typeof OUTPUTS>, "instagram"),
      template: oneOf(style.template, TEMPLATES, "block"),
      format: oneOf(style.format, Object.keys(FORMATS) as Array<keyof typeof FORMATS>, DEFAULT_FORMAT),
      accent: oneOf(style.accent, ACCENTS, "coral"),
      detailStyle: (typeof style.detailStyle === "string" ? style.detailStyle : "auto") as Project["style"]["detailStyle"],
    },
    overrides: isObj(p.overrides) ? (p.overrides as Project["overrides"]) : {},
    textColours: isObj(p.textColours) ? (p.textColours as Project["textColours"]) : undefined,
  } as Project;
}

export function migrateProject(raw: unknown, now: Date = new Date()): MigrationResult {
  if (!isObj(raw)) return { ok: false, reason: "The saved data isn't a creative.", from: null };
  if (typeof raw.id !== "string" || !raw.id) return { ok: false, reason: "The saved creative has no id.", from: null };
  const from = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
  if (from > SCHEMA_VERSION) {
    return { ok: false, reason: `It was saved by a newer version of the app (format ${from}). Reload the page to get the latest version; the draft is kept unchanged.`, from };
  }
  try {
    let p: Raw = structuredClone(raw);
    for (let v = from; v < SCHEMA_VERSION; v++) {
      const step = STEPS[v];
      if (!step) return { ok: false, reason: `There's no upgrade from format ${v}.`, from };
      p = step(p);
    }
    const project = normalizeProject(withDefaults(p, now.toISOString()));
    const changed = JSON.stringify(project) !== JSON.stringify(raw);
    return { ok: true, project, from, changed };
  } catch (e) {
    return { ok: false, reason: `The saved creative couldn't be read (${e instanceof Error ? e.message : "unknown error"}).`, from };
  }
}

/** Thrown when a stored draft can't be opened safely. The stored record is left untouched. */
export class DraftReadError extends Error {
  constructor(
    readonly draftId: string,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "DraftReadError";
  }
}
