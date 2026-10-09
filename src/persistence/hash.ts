import type { BlobId } from "@/model/assets";

/**
 * SHA-256 of a file, hex. Web Crypto exists on every HTTPS deployment and on
 * localhost. On a plain-http LAN address it doesn't, so the fallback gives a
 * unique (non-deduplicating) id rather than failing the upload.
 */
export async function hashBlob(blob: Blob): Promise<BlobId> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "u-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
