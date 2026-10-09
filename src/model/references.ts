import type { BlobId, ImageSource } from "./assets";
import type { Project } from "./project";

/** Every uploaded file a project depends on. Used for backups and storage clean-up. */
export function blobsUsedBy(project: Project): Set<BlobId> {
  const used = new Set<BlobId>();
  const add = (s: ImageSource) => {
    if (s.kind === "upload") used.add(s.blobId);
  };
  if (project.photo.source) add(project.photo.source);
  project.logos.partners.forEach((p) => add(p.source));
  return used;
}
