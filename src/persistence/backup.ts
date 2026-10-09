import { migrateProject } from "@/model/migrate";
import { newProjectId } from "@/model/blank";
import { uploadsIn } from "@/model/files";
import type { Project } from "@/model/project";
import { safeToken } from "@/export/filename";
import type { BlobStore, LogoLibrary, PhotoLibrary, ProjectBackup, ProjectStore } from "./types";

/**
 * Project backup files: the editable creative plus every file it needs
 * (uploaded photo, uploaded logos, generated website landscape), so it can
 * be restored in any browser and edited again. Not the PNG download.
 *
 * Restoring never overwrites anything: files are content-addressed (an
 * identical file is simply reused), and if a draft with the same id already
 * exists in this browser the backup is restored as a separate copy.
 */

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export const BACKUP_EXTENSION = ".sis-project.json";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function createBackup(project: Project, blobs: BlobStore, now: Date = new Date()): Promise<ProjectBackup> {
  const files: Record<string, string> = {};
  const missing: string[] = [];
  for (const u of uploadsIn(project)) {
    const blob = await blobs.get(u.blobId);
    if (!blob) {
      missing.push(u.name);
      continue;
    }
    files[u.blobId] = `data:${blob.type || "application/octet-stream"};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  }
  if (missing.length) throw new BackupError(`These files aren't in this browser, so the backup would be incomplete: ${missing.join(", ")}. Re-upload them first.`);
  const { library: _link, ...rest } = project;
  return {
    app: "sis-collaterals",
    backupVersion: 1,
    exportedAt: now.toISOString(),
    project: rest,
    files,
    logos: project.logos.partners.flatMap((p) => (p.source.kind === "upload" ? [{ name: p.source.name, blobId: p.source.blobId }] : [])),
  };
}

export function backupFileName(project: Project): string {
  const name = safeToken(project.name || project.content.headline.split("\n")[0] || "", 40) || "creative";
  return `SIS_${name}${BACKUP_EXTENSION}`;
}

export function backupBlob(backup: ProjectBackup): Blob {
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export interface RestoreDeps {
  blobs: BlobStore;
  projects: ProjectStore;
  /** Optional: re-add restored logos/photos to this browser's pickers (best effort). */
  logos?: LogoLibrary | null;
  photos?: PhotoLibrary | null;
  newId?: () => string;
  now?: () => Date;
}

/**
 * Restores a backup as a saved draft in this browser and returns it. Checks
 * every file against its content hash, and upgrades older project formats.
 */
export async function restoreBackup(json: unknown, deps: RestoreDeps): Promise<Project> {
  const b = json as Partial<ProjectBackup> | null;
  if (!b || b.app !== "sis-collaterals" || typeof b.files !== "object" || b.files === null) throw new BackupError("This isn't an SIS Collaterals project file.");
  if (typeof b.backupVersion !== "number" || b.backupVersion > 1) throw new BackupError("This project file was made by a newer version of the app. Reload the page to update, then import it again.");
  const migrated = migrateProject(b.project);
  if (!migrated.ok) throw new BackupError(`The creative in this file couldn't be read: ${migrated.reason}`);
  let project = migrated.project;

  // Files first, each verified: a file whose content doesn't match its id is refused.
  for (const u of uploadsIn(project)) {
    const dataUrl = b.files[u.blobId];
    if (typeof dataUrl !== "string") throw new BackupError(`The project file is missing “${u.name}”.`);
    const m = dataUrl.match(/^data:([^;,]*);base64,(.*)$/s);
    if (!m) throw new BackupError(`“${u.name}” in the project file is damaged.`);
    const blob = new Blob([fromBase64(m[2]!) as unknown as ArrayBuffer], { type: m[1] });
    const stored = await deps.blobs.put(blob);
    if (stored !== u.blobId) throw new BackupError(`“${u.name}” in the project file is damaged (its content doesn't match).`);
  }

  // Never overwrite an existing draft: restore as a copy if the id is taken.
  const now = (deps.now ?? (() => new Date()))().toISOString();
  let exists = false;
  try {
    exists = (await deps.projects.loadRawProject(project.id)) !== null;
  } catch {
    exists = true;
  }
  if (exists) project = { ...project, id: (deps.newId ?? newProjectId)(), name: project.name ? `${project.name} (restored)` : "" };
  project = { ...project, updatedAt: now };
  await deps.projects.saveProject(project);

  // Best effort: make restored logos and the photo selectable in this browser's pickers too.
  for (const l of b.logos ?? []) {
    try {
      const blob = await deps.blobs.get(l.blobId);
      if (blob && deps.logos) await deps.logos.addLogo(new File([blob], l.name, { type: blob.type }));
    } catch {
      /* the creative still has the file; only the picker entry is skipped */
    }
  }
  if (project.photo.source?.kind === "upload" && deps.photos) {
    try {
      const blob = await deps.blobs.get(project.photo.source.blobId);
      if (blob) await deps.photos.addPhoto(new File([blob], project.photo.source.name, { type: blob.type }));
    } catch {
      /* as above */
    }
  }
  return project;
}
