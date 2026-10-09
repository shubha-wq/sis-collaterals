import type { ImageSource } from "@/model/assets";
import type { BlobStore } from "@/persistence/types";
import { findBuiltinLogo, findBuiltinPhoto } from "./catalog";

export type ResolvedImage =
  | { status: "ready"; url: string; release: () => void }
  /** The file isn't available (deleted, site data cleared, unknown id). Templates show a placeholder; export is blocked. */
  | { status: "missing"; source: ImageSource };

/**
 * Turns an image reference into something drawable. Never throws for a
 * missing file: a gone logo must not break a project.
 */
export async function resolveImage(source: ImageSource, blobs: BlobStore): Promise<ResolvedImage> {
  if (source.kind === "builtin") {
    const found = findBuiltinLogo(source.id) ?? findBuiltinPhoto(source.id);
    return found ? { status: "ready", url: found.url, release: () => {} } : { status: "missing", source };
  }
  let blob: Blob | null = null;
  try {
    blob = await blobs.get(source.blobId);
  } catch {
    blob = null;
  }
  if (!blob) return { status: "missing", source };
  const url = URL.createObjectURL(blob);
  return { status: "ready", url, release: () => URL.revokeObjectURL(url) };
}
