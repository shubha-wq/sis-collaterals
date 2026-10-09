import { STORES, idbDelete, idbGet, idbGetAll, idbPut } from "./idb";
import type { BlobStore, LogoLibrary, LogoProcessor, LogoRecord } from "./types";

const MAX_NAME = 60;

function newId(): string {
  return "logo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export class IndexedDbLogoLibrary implements LogoLibrary {
  private readonly db: IDBDatabase;
  private readonly blobs: BlobStore;
  private readonly processor: LogoProcessor;

  constructor(db: IDBDatabase, blobs: BlobStore, processor: LogoProcessor) {
    this.db = db;
    this.blobs = blobs;
    this.processor = processor;
  }

  async addLogo(file: File): Promise<LogoRecord> {
    const p = await this.processor.process(file);
    const originalBlobId = await this.blobs.put(p.original);
    const blobId = p.display === p.original ? originalBlobId : await this.blobs.put(p.display);
    // The same file uploaded twice is one library entry, not two.
    const existing = (await this.listLogos()).find((r) => r.originalBlobId === originalBlobId);
    if (existing) return existing;
    const record: LogoRecord = {
      id: newId(),
      name: p.name,
      blobId,
      originalBlobId,
      originalType: p.originalType,
      thumbnailBlobId: await this.blobs.put(p.thumbnail),
      meta: p.meta,
      addedAt: new Date().toISOString(),
    };
    await idbPut(this.db, STORES.logos, record);
    return record;
  }

  async getLogo(id: string): Promise<{ record: LogoRecord; blob: Blob } | null> {
    const record = await idbGet<LogoRecord>(this.db, STORES.logos, id);
    if (!record) return null;
    const blob = await this.blobs.get(record.blobId);
    return blob ? { record, blob } : null;
  }

  async listLogos(): Promise<LogoRecord[]> {
    const all = await idbGetAll<LogoRecord>(this.db, STORES.logos);
    return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  /** Removes the entry only; files stay until clean-up finds nothing uses them. */
  async deleteLogo(id: string): Promise<void> {
    await idbDelete(this.db, STORES.logos, id);
  }

  async renameLogo(id: string, name: string): Promise<LogoRecord> {
    const record = await idbGet<LogoRecord>(this.db, STORES.logos, id);
    if (!record) throw new Error("That logo is no longer in your library.");
    const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    if (!clean) throw new Error("Give the logo a name.");
    const next = { ...record, name: clean };
    await idbPut(this.db, STORES.logos, next);
    return next;
  }

  /** Every file the library itself still needs (for storage clean-up). */
  async referencedBlobs(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const r of await this.listLogos()) {
      ids.add(r.blobId);
      ids.add(r.originalBlobId);
      ids.add(r.thumbnailBlobId);
    }
    return ids;
  }
}
