import type { BlobId, ImageSource } from "./assets";
import type { Project } from "./project";

export type Upload = Extract<ImageSource, { kind: "upload" }>;

/**
 * Every stored file a creative needs, once each: the uploaded photo, uploaded
 * partner logos, and the generated website landscape. Built-in assets ship
 * with the app and aren't listed. Used by the Creative Library and backups.
 */
export function uploadsIn(project: Project): Upload[] {
  const derived: Upload | null = project.photo.expansion ? { kind: "upload", blobId: project.photo.expansion.blobId, name: "Generated landscape" } : null;
  const all = [project.photo.source, ...project.logos.partners.map((p) => p.source), derived].filter((s): s is Upload => s?.kind === "upload");
  const seen = new Set<BlobId>();
  return all.filter((s) => (seen.has(s.blobId) ? false : (seen.add(s.blobId), true)));
}
