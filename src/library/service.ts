import { newProjectId } from "@/model/blank";
import { migrateProject } from "@/model/migrate";
import type { Project } from "@/model/project";
import type { BlobStore } from "@/persistence/types";
import { rangeStart, type DateRange } from "./filter";
import { LibraryError, type CreativeFields, type CreativeSummary, type CreativeVersionInfo, type LibraryBackend, type SharedAssetStore } from "./types";

/**
 * The Creative Library's rules, on top of any backend:
 *
 * - Saving stores the complete structured project (never an image), after
 *   making sure every uploaded file it uses is in team storage, so a
 *   teammate can always reopen it. A file that can't be shared stops the
 *   save with a clear message instead of storing a creative that would break.
 * - Save changes updates the same creative and archives the version it
 *   replaces. It only succeeds if nobody else saved in between.
 * - Save as new creates a separate creative; the original is untouched.
 * - Opening copies any team file this browser doesn't have into its local
 *   blob store first, so the creative renders exactly as saved.
 * - Library saves are always explicit (no autosave), so they never multiply.
 */
export interface CreativeLibraryDeps {
  backend: LibraryBackend;
  assets: SharedAssetStore;
  /** This browser's blob store (what the editor renders from). */
  blobs: BlobStore;
  now?: () => Date;
  newId?: () => string;
}

export interface OpenedCreative {
  project: Project;
  /** Names of files that couldn't be found in team storage (shown as missing; download is blocked until replaced). */
  missing: string[];
  /** Set when an earlier version was opened. */
  restoredFrom?: number;
}

export { uploadsIn } from "@/model/files";
import { uploadsIn } from "@/model/files";

export function fieldsFor(project: Project, thumbnailPath: string | null): CreativeFields {
  const output = project.style.output ?? "instagram";
  const c = project.content;
  return {
    output,
    template: output === "instagram" ? project.style.template : null,
    headline: c.headline.trim(),
    eventDate: c.date.trim(),
    eventDay: c.day.trim(),
    city: c.city.trim(),
    venue: c.venue.trim(),
    thumbnailPath,
  };
}

/** The project as stored: its library link is the record's business, not the project's. */
function forStorage(project: Project): Project {
  const { library: _link, ...rest } = project;
  return rest;
}

export class CreativeLibrary {
  private readonly now: () => Date;
  private readonly newId: () => string;
  constructor(private readonly deps: CreativeLibraryDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? newProjectId;
  }

  list(range: DateRange): Promise<CreativeSummary[]> {
    return this.deps.backend.list({ since: rangeStart(range, this.now()) });
  }

  versions(id: string): Promise<CreativeVersionInfo[]> {
    return this.deps.backend.listVersions(id);
  }

  thumbnailUrl(path: string): Promise<string | null> {
    return this.deps.assets.thumbnailUrl(path);
  }

  /** Puts every uploaded file the creative uses into team storage (each file once, by content hash). */
  async shareAssets(project: Project): Promise<void> {
    for (const s of uploadsIn(project)) {
      if (await this.deps.assets.hasBlob(s.blobId)) continue;
      const file = await this.deps.blobs.get(s.blobId);
      if (!file) throw new LibraryError("asset-missing", `“${s.name}” isn't in this browser any more, so it can't be shared with the team. Upload it again, then save.`);
      await this.deps.assets.putBlob(s.blobId, file);
    }
  }

  private async thumbnail(id: string, thumb: Blob | null | undefined): Promise<string | null> {
    if (!thumb) return null;
    const path = `thumbs/${id}/${this.now().getTime()}.jpg`;
    try {
      await this.deps.assets.putThumbnail(path, thumb);
      return path;
    } catch {
      return null; // a preview is nice to have; never fail a save over it
    }
  }

  private link(project: Project, s: CreativeSummary): Project {
    return { ...project, id: s.id, library: { version: s.version, savedAt: s.updatedAt } };
  }

  /**
   * Adds the creative to the library as a new entry. A creative opened from
   * the library (or saved there before) gets a new id: that's Save as new.
   */
  async saveNew(project: Project, thumb?: Blob | null): Promise<Project> {
    await this.shareAssets(project);
    const stamp = this.now().toISOString();
    let id = project.library ? this.newId() : project.id;
    const fresh: Project = { ...forStorage(project), id, createdAt: project.library ? stamp : project.createdAt, updatedAt: stamp };
    const thumbnailPath = await this.thumbnail(id, thumb);
    let saved: CreativeSummary;
    try {
      saved = await this.deps.backend.insert(id, fresh, fieldsFor(fresh, thumbnailPath));
    } catch (e) {
      if (!(e instanceof LibraryError && e.code === "exists")) throw e;
      id = this.newId();
      saved = await this.deps.backend.insert(id, { ...fresh, id }, fieldsFor(fresh, thumbnailPath));
    }
    return this.link({ ...fresh, id }, saved);
  }

  /** Updates the creative it was opened from. The replaced version is kept. */
  async saveChanges(project: Project, thumb?: Blob | null): Promise<Project> {
    if (!project.library) throw new LibraryError("not-found", "This creative isn't in the Creative Library yet. Use Save to Library.");
    await this.shareAssets(project);
    const stamp = this.now().toISOString();
    const next: Project = { ...forStorage(project), updatedAt: stamp };
    const thumbnailPath = await this.thumbnail(project.id, thumb);
    const saved = await this.deps.backend.update(project.id, project.library.version, next, fieldsFor(next, thumbnailPath));
    return this.link(next, saved);
  }

  /** Loads a creative (or one of its earlier versions) ready to edit, fetching any team files this browser lacks. */
  async open(id: string, version?: number): Promise<OpenedCreative> {
    const record = await this.deps.backend.get(id);
    if (!record) throw new LibraryError("not-found", "This creative is no longer in the library.");
    let stored = record.project;
    let restoredFrom: number | undefined;
    if (version !== undefined && version !== record.version) {
      const old = await this.deps.backend.getVersion(id, version);
      if (!old) throw new LibraryError("not-found", `Version ${version} of this creative couldn't be found.`);
      stored = old;
      restoredFrom = version;
    }
    // Linked to the current version, so Save changes makes an older version current (and archives the current one).
    // Records may come from any app version: upgrade safely on read (the stored record is not changed).
    const migrated = migrateProject({ ...stored, id });
    if (!migrated.ok) throw new LibraryError("unavailable", `This creative couldn't be opened safely: ${migrated.reason}`);
    const project: Project = { ...migrated.project, library: { version: record.version, savedAt: record.updatedAt } };
    const missing: string[] = [];
    for (const s of uploadsIn(project)) {
      if (await this.deps.blobs.has(s.blobId)) continue;
      const file = await this.deps.assets.getBlob(s.blobId);
      if (file) await this.deps.blobs.put(file);
      else missing.push(s.name);
    }
    return { project, missing, restoredFrom };
  }
}
