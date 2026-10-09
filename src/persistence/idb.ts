/**
 * Minimal promise wrapper over IndexedDB. Only persistence/ imports this.
 * Files are stored as ArrayBuffer + MIME type rather than Blob, which every
 * browser (including older Safari) stores reliably.
 */

export const DB_NAME = "sis-collaterals";
/**
 * v1: blobs, logos. v2: + projects (saved drafts), meta (last-opened draft).
 * v3: + photos (uploaded photo library).
 *
 * Rules for every future version: upgrades only ADD stores or indexes. Never
 * delete the database, delete a store or clear one here; never transform
 * stored drafts in an upgrade (drafts are upgraded on read, model/migrate.ts).
 * App deployments don't touch this database at all: it lives in each
 * person's browser, per site address (origin).
 */
export const DB_VERSION = 3;
export const STORES = { blobs: "blobs", logos: "logos", projects: "projects", meta: "meta", photos: "photos" } as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];
/** Fired on window when a newer app version (another tab) takes over browser storage. */
export const STORAGE_CLOSED_EVENT = "sis-storage-closed";

export function openDatabase(name: string = DB_NAME, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.blobs)) db.createObjectStore(STORES.blobs);
      if (!db.objectStoreNames.contains(STORES.logos)) db.createObjectStore(STORES.logos, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
      if (!db.objectStoreNames.contains(STORES.photos)) db.createObjectStore(STORES.photos, { keyPath: "id" });
    };
    req.onsuccess = () => {
      // Let a newer version of the app (another tab) upgrade the database. This
      // tab then can't save, so tell the editor to ask for a reload (saved
      // drafts are safe; the upgrade only ever adds stores).
      req.result.onversionchange = () => {
        req.result.close();
        if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_CLOSED_EVENT));
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error("Couldn't open browser storage."));
    req.onblocked = () => reject(new Error("Browser storage is busy in another tab. Close other tabs of this app and try again."));
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbGet<T>(db: IDBDatabase, store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return done(db.transaction(store, "readonly").objectStore(store).get(key)) as Promise<T | undefined>;
}

export function idbGetAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return done(db.transaction(store, "readonly").objectStore(store).getAll()) as Promise<T[]>;
}

export function idbGetAllKeys(db: IDBDatabase, store: StoreName): Promise<IDBValidKey[]> {
  return done(db.transaction(store, "readonly").objectStore(store).getAllKeys());
}

export async function idbPut(db: IDBDatabase, store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  await done(db.transaction(store, "readwrite").objectStore(store).put(value, key));
}

export async function idbDelete(db: IDBDatabase, store: StoreName, key: IDBValidKey): Promise<void> {
  await done(db.transaction(store, "readwrite").objectStore(store).delete(key));
}
