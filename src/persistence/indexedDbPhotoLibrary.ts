import { validatePhotoFile } from "@/assets/uploadPhoto";
import { STORES, idbDelete, idbGetAll, idbPut } from "./idb";
import type { BlobStore, PhotoLibrary, PhotoProcessor, PhotoRecord } from "./types";

export class IndexedDbPhotoLibrary implements PhotoLibrary {
  private readonly db: IDBDatabase;
  private readonly blobs: BlobStore;
  private readonly processor: PhotoProcessor;

  constructor(db: IDBDatabase, blobs: BlobStore, processor: PhotoProcessor) {
    this.db = db;
    this.blobs = blobs;
    this.processor = processor;
  }

  async addPhoto(file: File): Promise<PhotoRecord> {
    validatePhotoFile(file);
    const p = await this.processor.process(file);
    const blobId = await this.blobs.put(file);
    const existing = (await this.listPhotos()).find((r) => r.blobId === blobId);
    if (existing) return existing;
    const record: PhotoRecord = {
      id: "photo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      name: p.name,
      blobId,
      thumbnailBlobId: await this.blobs.put(p.thumbnail),
      width: p.width,
      height: p.height,
      addedAt: new Date().toISOString(),
    };
    await idbPut(this.db, STORES.photos, record);
    return record;
  }

  async listPhotos(): Promise<PhotoRecord[]> {
    const all = await idbGetAll<PhotoRecord>(this.db, STORES.photos);
    return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  async deletePhoto(id: string): Promise<void> {
    await idbDelete(this.db, STORES.photos, id);
  }
}
