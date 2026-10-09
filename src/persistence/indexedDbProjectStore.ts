import type { Project } from "@/model/project";
import { readDraft, sortSummaries, summarise } from "./drafts";
import { STORES, idbDelete, idbGet, idbGetAll, idbGetAllKeys, idbPut } from "./idb";
import type { ProjectStore, ProjectSummary, SessionStore } from "./types";

/** Saved drafts. Projects hold references only, so records stay small. */
export class IndexedDbProjectStore implements ProjectStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async saveProject(project: Project): Promise<void> {
    await idbPut(this.db, STORES.projects, structuredClone(project));
  }

  async loadProject(id: string): Promise<Project | null> {
    return readDraft(id, await idbGet<unknown>(this.db, STORES.projects, id));
  }

  async loadRawProject(id: string): Promise<unknown> {
    return (await idbGet<unknown>(this.db, STORES.projects, id)) ?? null;
  }

  async deleteProject(id: string): Promise<void> {
    await idbDelete(this.db, STORES.projects, id);
  }

  /** Most recently edited first. */
  async listProjects(): Promise<ProjectSummary[]> {
    const [all, keys] = await Promise.all([idbGetAll<unknown>(this.db, STORES.projects), idbGetAllKeys(this.db, STORES.projects)]);
    return sortSummaries(all.map((raw, i) => summarise(raw, String(keys[i]))));
  }
}

const LAST_OPENED = "lastOpenedDraft";

export class IndexedDbSessionStore implements SessionStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async getLastOpenedDraft(): Promise<string | null> {
    return (await idbGet<string>(this.db, STORES.meta, LAST_OPENED)) ?? null;
  }

  async setLastOpenedDraft(id: string | null): Promise<void> {
    if (id === null) await idbDelete(this.db, STORES.meta, LAST_OPENED);
    else await idbPut(this.db, STORES.meta, id, LAST_OPENED);
  }
}
