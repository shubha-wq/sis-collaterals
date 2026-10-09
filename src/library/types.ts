import type { BlobId } from "@/model/assets";
import type { OutputId } from "@/model/outputs";
import type { Project, TemplateId } from "@/model/project";

/**
 * The shared Creative Library: the team's saved creatives, stored as the
 * full structured Project (never a flattened image), so any of them can be
 * reopened, edited and downloaded again from any teammate's browser.
 *
 * Separate from local Drafts (persistence/), which stay per browser.
 */

/** What the library list shows and filters on. Denormalised from the project when saved. */
export interface CreativeSummary {
  id: string;
  /** Increases by one on every Save changes. */
  version: number;
  createdAt: string;
  /** Last saved to the library. */
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  output: OutputId;
  /** Instagram only. */
  template: TemplateId | null;
  headline: string;
  /** Event date and day as typed. */
  eventDate: string;
  eventDay: string;
  city: string;
  venue: string;
  /** Storage path of a small JPEG preview, if one was made. */
  thumbnailPath: string | null;
}

export interface CreativeRecord extends CreativeSummary {
  /** The complete editable creative (without its `library` link). */
  project: Project;
}

export interface CreativeVersionInfo {
  version: number;
  savedAt: string;
  savedBy: string | null;
  thumbnailPath: string | null;
}

/** Fields written alongside the project JSON on every save. */
export type CreativeFields = Pick<CreativeSummary, "output" | "template" | "headline" | "eventDate" | "eventDay" | "city" | "venue" | "thumbnailPath">;

export interface ListQuery {
  /** Only creatives last saved at or after this ISO time. Omit for all. */
  since?: string;
}

/**
 * Where library records live. Implemented by Supabase (shared, production)
 * and in memory (tests, and a clearly-labelled dev preview).
 */
export interface LibraryBackend {
  /** Newest saved first. */
  list(query: ListQuery): Promise<CreativeSummary[]>;
  get(id: string): Promise<CreativeRecord | null>;
  /** Creates version 1. Throws LibraryError("exists") if the id is taken. */
  insert(id: string, project: Project, fields: CreativeFields): Promise<CreativeSummary>;
  /**
   * Archives the current version, then replaces it — only if the stored
   * version is still `expectedVersion`. Otherwise nothing changes and
   * LibraryError("conflict") is thrown.
   */
  update(id: string, expectedVersion: number, project: Project, fields: CreativeFields): Promise<CreativeSummary>;
  listVersions(id: string): Promise<CreativeVersionInfo[]>;
  getVersion(id: string, version: number): Promise<Project | null>;
}

/**
 * Team-shared files. Uploaded photos and logos are stored once under their
 * content hash (the same BlobId the browser uses), so the same file is never
 * stored twice and every creative that uses it shares it. Nothing in the app
 * deletes from here.
 */
export interface SharedAssetStore {
  hasBlob(id: BlobId): Promise<boolean>;
  putBlob(id: BlobId, file: Blob): Promise<void>;
  getBlob(id: BlobId): Promise<Blob | null>;
  putThumbnail(path: string, file: Blob): Promise<void>;
  /** A URL an <img> can show, or null. */
  thumbnailUrl(path: string): Promise<string | null>;
}

export type LibraryErrorCode = "exists" | "conflict" | "not-found" | "asset-missing" | "unavailable" | "unauthorised";

/** A library failure with a message that can be shown to people as is. */
export class LibraryError extends Error {
  readonly code: LibraryErrorCode;
  constructor(code: LibraryErrorCode, message: string) {
    super(message);
    this.name = "LibraryError";
    this.code = code;
  }
}
