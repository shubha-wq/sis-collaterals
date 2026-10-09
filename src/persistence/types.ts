import type { BlobId, ImageMeta, LogoFileType } from "@/model/assets";
import type { Project } from "@/model/project";

/**
 * Storage contracts. The UI and state layer talk only to these interfaces.
 * V1 implements them on IndexedDB in this browser; a shared cloud backend
 * can implement the same interfaces later without UI changes.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  /** Set when the stored draft can't be opened safely: why. Its data is kept untouched. */
  needsRecovery?: string;
}

/**
 * Explicitly saved drafts in this browser. Nothing is written here until the
 * person chooses Save draft; after that, edits to that draft autosave.
 */
export interface ProjectStore {
  saveProject(project: Project): Promise<void>;
  /** Upgraded to the current schema on read (never written back by reading). Throws DraftReadError if it can't be read safely. */
  loadProject(id: string): Promise<Project | null>;
  /** The stored record exactly as saved, for recovery (e.g. a draft that can't be opened). */
  loadRawProject(id: string): Promise<unknown>;
  deleteProject(id: string): Promise<void>;
  listProjects(): Promise<ProjectSummary[]>;
}

/**
 * Which saved draft was open when the app was last used, so it can reopen.
 * Never points at unsaved work: unsaved work is not stored at all.
 */
export interface SessionStore {
  getLastOpenedDraft(): Promise<string | null>;
  setLastOpenedDraft(id: string | null): Promise<void>;
}

/** Content-addressed file storage shared by the logo library and projects. */
export interface BlobStore {
  /** Stores the file under its SHA-256 and returns that id. Idempotent. */
  put(file: Blob): Promise<BlobId>;
  get(id: BlobId): Promise<Blob | null>;
  has(id: BlobId): Promise<boolean>;
  /** Removes blobs not in `referenced`. Returns how many were removed. */
  collectGarbage(referenced: ReadonlySet<BlobId>): Promise<number>;
}

export interface LogoRecord {
  id: string;
  name: string;
  /** The file drawn on the canvas: the original, or PNG for a PDF upload. */
  blobId: BlobId;
  /** The untouched uploaded file. Same as `blobId` unless it was converted. */
  originalBlobId: BlobId;
  originalType: LogoFileType;
  /** Small transparent PNG preview for the picker. */
  thumbnailBlobId: BlobId;
  meta: ImageMeta;
  addedAt: string;
}

/** Thrown for uploads that can't become a logo; `message` is shown to people. */
export class LogoUploadError extends Error {
  readonly code: "unsupported-type" | "too-large" | "unreadable" | "pdf-failed";
  constructor(code: LogoUploadError["code"], message: string) {
    super(message);
    this.name = "LogoUploadError";
    this.code = code;
  }
}

/** What the library needs from upload processing (implemented in assets/). */
export interface ProcessedLogo {
  name: string;
  original: Blob;
  originalType: LogoFileType;
  /** File to draw: the original, or a PNG rendered from a PDF. */
  display: Blob;
  thumbnail: Blob;
  meta: ImageMeta;
}

export interface LogoProcessor {
  process(file: File): Promise<ProcessedLogo>;
}

/** This user's uploaded partner logos. Built-in logos are not stored here. */
export interface LogoLibrary {
  /** Keeps the original file; generates name, metadata and thumbnail. Re-uploading the same file returns the existing entry. */
  addLogo(file: File): Promise<LogoRecord>;
  getLogo(id: string): Promise<{ record: LogoRecord; blob: Blob } | null>;
  /** Newest first. */
  listLogos(): Promise<LogoRecord[]>;
  /** Removes the library entry only. Projects using the file keep working. */
  deleteLogo(id: string): Promise<void>;
  renameLogo(id: string, name: string): Promise<LogoRecord>;
}

export interface PhotoRecord {
  id: string;
  name: string;
  /** The uploaded file, untouched. */
  blobId: BlobId;
  /** Small JPEG preview for the picker. */
  thumbnailBlobId: BlobId;
  width: number;
  height: number;
  addedAt: string;
}

/** What the photo library needs from upload processing (implemented in assets/). */
export interface PhotoProcessor {
  process(file: File): Promise<{ name: string; thumbnail: Blob; width: number; height: number }>;
}

/** This user's uploaded photos, kept in this browser independently of drafts. */
export interface PhotoLibrary {
  /** Re-uploading the same file returns the existing entry. */
  addPhoto(file: File): Promise<PhotoRecord>;
  /** Newest first. */
  listPhotos(): Promise<PhotoRecord[]>;
  /** Removes the library entry only. Creatives using the photo keep working. */
  deletePhoto(id: string): Promise<void>;
}

/** A portable project file: the project plus every uploaded file it uses. */
export interface ProjectBackup {
  app: "sis-collaterals";
  backupVersion: 1;
  exportedAt: string;
  /** The editable creative (without its Creative Library link). */
  project: Omit<Project, "library">;
  /** blobId → base64 data URL. Present only in backups, never in live state. */
  files: Record<BlobId, string>;
  /** Library entries for those files, so they can be re-added on import. */
  logos: Array<Pick<LogoRecord, "name" | "blobId">>;
}
