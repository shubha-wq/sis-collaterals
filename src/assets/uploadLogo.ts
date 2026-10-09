import { MAX_PARTNER_LOGOS, type PartnerLogo, type Project } from "@/model/project";
import type { LogoLibrary, LogoRecord } from "@/persistence/types";
import { assessLogo } from "@/validation/logoChecks";
import type { Issue } from "@/validation/types";

export interface UploadResult {
  project: Project;
  record: LogoRecord;
  /** Advice to show; the file itself is never altered. */
  issues: Issue[];
}

/**
 * The single upload action: save to the library, then add to the creative.
 * One step for the person; there is no separate "save to library".
 * Logo background is untouched (it stays whatever the creative uses, None by default).
 */
export async function uploadPartnerLogo(project: Project, file: File, library: LogoLibrary): Promise<UploadResult> {
  const record = await library.addLogo(file);
  const { project: next, added } = addLibraryLogo(project, record);
  const issues = assessLogo(record.meta, record.name);
  if (!added && !usesLogo(project, record)) {
    issues.unshift({
      id: "logo-row-full",
      level: "warning",
      message: `This creative already has ${MAX_PARTNER_LOGOS} partner logos. ${record.name} is saved in your library; remove a logo to add it.`,
    });
  }
  return { project: next, record, issues };
}

function usesLogo(project: Project, record: LogoRecord): boolean {
  return project.logos.partners.some((p) => p.source.kind === "upload" && p.source.blobId === record.blobId);
}

/** Adds a library logo to the creative. No-op if it's already there or the row is full. */
export function addLibraryLogo(project: Project, record: LogoRecord): { project: Project; added: boolean } {
  if (usesLogo(project, record) || project.logos.partners.length >= MAX_PARTNER_LOGOS) return { project, added: false };
  const entry: PartnerLogo = {
    id: "p-" + record.id,
    source: { kind: "upload", blobId: record.blobId, libraryId: record.id, name: record.name },
  };
  return { project: { ...project, logos: { ...project.logos, partners: [...project.logos.partners, entry] } }, added: true };
}
