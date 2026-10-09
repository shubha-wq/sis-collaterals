import { readDraft, sortSummaries, summarise } from "./drafts";
import type { Project } from "@/model/project";
import type { ProjectStore, ProjectSummary, SessionStore } from "./types";

/**
 * In-memory stores: used when browser storage can't be opened (editing still
 * works, nothing survives a reload), and in tests.
 */
export class MemoryProjectStore implements ProjectStore {
  private readonly items = new Map<string, unknown>();
  async saveProject(project: Project): Promise<void> {
    this.items.set(project.id, structuredClone(project));
  }
  async loadProject(id: string): Promise<Project | null> {
    const p = this.items.get(id);
    return p === undefined ? null : readDraft(id, structuredClone(p));
  }
  async loadRawProject(id: string): Promise<unknown> {
    const p = this.items.get(id);
    return p === undefined ? null : structuredClone(p);
  }
  /** Tests: store a record exactly as an older (or broken) version would have. */
  putRaw(id: string, raw: unknown): void {
    this.items.set(id, structuredClone(raw));
  }
  async deleteProject(id: string): Promise<void> {
    this.items.delete(id);
  }
  async listProjects(): Promise<ProjectSummary[]> {
    return sortSummaries([...this.items.entries()].map(([k, raw]) => summarise(raw, k)));
  }
}

export class MemorySessionStore implements SessionStore {
  private last: string | null = null;
  async getLastOpenedDraft(): Promise<string | null> {
    return this.last;
  }
  async setLastOpenedDraft(id: string | null): Promise<void> {
    this.last = id;
  }
}
