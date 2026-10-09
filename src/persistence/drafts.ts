import { displayName } from "@/model/blank";
import { DraftReadError, migrateProject } from "@/model/migrate";
import type { Project } from "@/model/project";
import type { ProjectSummary } from "./types";

/**
 * Shared rules for reading stored drafts (IndexedDB and in-memory stores):
 * upgrade on read, never rewrite on read, and report a draft that can't be
 * read safely instead of hiding or replacing it.
 */
export function readDraft(id: string, raw: unknown): Project | null {
  if (raw === undefined || raw === null) return null;
  const r = migrateProject(raw);
  if (!r.ok) throw new DraftReadError(id, r.reason);
  return r.project;
}

/** One list entry per stored record, even a broken one (marked for recovery). */
export function summarise(raw: unknown, key: string): ProjectSummary {
  const r = migrateProject(raw);
  if (r.ok) return { id: r.project.id, name: displayName(r.project), updatedAt: r.project.updatedAt };
  const rec = (typeof raw === "object" && raw !== null ? raw : {}) as { id?: unknown; updatedAt?: unknown };
  return { id: typeof rec.id === "string" ? rec.id : key, name: "Draft that needs recovery", updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : "", needsRecovery: r.reason };
}

export function sortSummaries(list: ProjectSummary[]): ProjectSummary[] {
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
