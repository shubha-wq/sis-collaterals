import type { BlobId } from "@/model/assets";
import { hashBlob } from "./hash";
import { STORES, idbDelete, idbGet, idbGetAllKeys, idbPut } from "./idb";
import type { BlobStore } from "./types";

interface StoredBlob {
  type: string;
  data: ArrayBuffer;
  bytes: number;
  storedAt: string;
}

export class IndexedDbBlobStore implements BlobStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async put(file: Blob): Promise<BlobId> {
    const id = await hashBlob(file);
    if (await this.has(id)) return id;
    const record: StoredBlob = { type: file.type, data: await file.arrayBuffer(), bytes: file.size, storedAt: new Date().toISOString() };
    await idbPut(this.db, STORES.blobs, record, id);
    return id;
  }

  async get(id: BlobId): Promise<Blob | null> {
    const r = await idbGet<StoredBlob>(this.db, STORES.blobs, id);
    return r ? new Blob([r.data], { type: r.type }) : null;
  }

  async has(id: BlobId): Promise<boolean> {
    return (await idbGet<StoredBlob>(this.db, STORES.blobs, id)) !== undefined;
  }

  async collectGarbage(referenced: ReadonlySet<BlobId>): Promise<number> {
    let removed = 0;
    for (const key of await idbGetAllKeys(this.db, STORES.blobs)) {
      if (!referenced.has(String(key))) {
        await idbDelete(this.db, STORES.blobs, key);
        removed += 1;
      }
    }
    return removed;
  }
}
