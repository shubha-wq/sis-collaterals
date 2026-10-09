import type { BlobId } from "@/model/assets";
import type { Project } from "@/model/project";
import { LibraryError, type CreativeFields, type CreativeRecord, type CreativeSummary, type CreativeVersionInfo, type LibraryBackend, type ListQuery, type SharedAssetStore } from "./types";

/**
 * In-memory library. Used by tests (several "teammates" can share one
 * instance) and by the dev server when Supabase isn't configured, where the
 * UI labels it as a local, unshared preview.
 */
export class MemoryLibraryBackend implements LibraryBackend {
  private rows = new Map<string, CreativeRecord>();
  private versions = new Map<string, Array<CreativeVersionInfo & { project: Project }>>();
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly user: () => string | null = () => null,
  ) {}

  private summary(r: CreativeRecord): CreativeSummary {
    const { project: _p, ...s } = r;
    return { ...s };
  }

  async list(q: ListQuery): Promise<CreativeSummary[]> {
    return [...this.rows.values()]
      .filter((r) => !q.since || r.updatedAt >= q.since)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((r) => this.summary(r));
  }

  async get(id: string): Promise<CreativeRecord | null> {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }

  async insert(id: string, project: Project, fields: CreativeFields): Promise<CreativeSummary> {
    if (this.rows.has(id)) throw new LibraryError("exists", "A creative with this id is already in the library.");
    const at = this.now().toISOString();
    const rec: CreativeRecord = { id, version: 1, createdAt: at, updatedAt: at, createdBy: this.user(), updatedBy: this.user(), ...fields, project: structuredClone(project) };
    this.rows.set(id, rec);
    return this.summary(rec);
  }

  async update(id: string, expectedVersion: number, project: Project, fields: CreativeFields): Promise<CreativeSummary> {
    const cur = this.rows.get(id);
    if (!cur) throw new LibraryError("not-found", "This creative is no longer in the library.");
    if (cur.version !== expectedVersion) throw new LibraryError("conflict", "Someone else saved changes to this creative.");
    const list = this.versions.get(id) ?? [];
    list.push({ version: cur.version, savedAt: cur.updatedAt, savedBy: cur.updatedBy, thumbnailPath: cur.thumbnailPath, project: cur.project });
    this.versions.set(id, list);
    const next: CreativeRecord = { ...cur, ...fields, version: cur.version + 1, updatedAt: this.now().toISOString(), updatedBy: this.user(), project: structuredClone(project) };
    this.rows.set(id, next);
    return this.summary(next);
  }

  async listVersions(id: string): Promise<CreativeVersionInfo[]> {
    return (this.versions.get(id) ?? []).map(({ project: _p, ...v }) => v).sort((a, b) => b.version - a.version);
  }

  async getVersion(id: string, version: number): Promise<Project | null> {
    const v = (this.versions.get(id) ?? []).find((x) => x.version === version);
    return v ? structuredClone(v.project) : null;
  }
}

export class MemorySharedAssets implements SharedAssetStore {
  readonly blobs = new Map<BlobId, Blob>();
  readonly thumbs = new Map<string, Blob>();
  async hasBlob(id: BlobId) {
    return this.blobs.has(id);
  }
  async putBlob(id: BlobId, file: Blob) {
    if (!this.blobs.has(id)) this.blobs.set(id, file);
  }
  async getBlob(id: BlobId) {
    return this.blobs.get(id) ?? null;
  }
  async putThumbnail(path: string, file: Blob) {
    this.thumbs.set(path, file);
  }
  async thumbnailUrl(path: string) {
    const b = this.thumbs.get(path);
    return b && typeof URL.createObjectURL === "function" ? URL.createObjectURL(b) : null;
  }
}
