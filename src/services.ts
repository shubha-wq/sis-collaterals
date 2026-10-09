import { browserLogoProcessor } from "./assets/browserLogoProcessor";
import { browserPhotoProcessor } from "./assets/browserPhotoProcessor";
import { openDatabase } from "./persistence/idb";
import { IndexedDbBlobStore } from "./persistence/indexedDbBlobStore";
import { IndexedDbLogoLibrary } from "./persistence/indexedDbLogoLibrary";
import { IndexedDbPhotoLibrary } from "./persistence/indexedDbPhotoLibrary";
import { IndexedDbProjectStore, IndexedDbSessionStore } from "./persistence/indexedDbProjectStore";
import type { BlobStore, LogoLibrary, PhotoLibrary, ProjectStore, SessionStore } from "./persistence/types";

/**
 * Composition root: the one place that picks storage implementations.
 * Swapping IndexedDB for shared cloud storage later means changing this file.
 *
 * Separate concerns, deliberately not mixed:
 *   built-in brand assets  → assets/catalog.ts (bundled, read-only)
 *   user logo library      → logos (+ blobs)
 *   user photo library     → photos (+ blobs)
 *   saved drafts           → projects
 *   last-opened draft      → session
 *   unsaved current work   → memory only (state/sessionController.ts)
 */
export interface Services {
  blobs: BlobStore;
  logos: LogoLibrary;
  photos: PhotoLibrary;
  projects: ProjectStore;
  session: SessionStore;
}

let services: Promise<Services> | null = null;

export function getServices(): Promise<Services> {
  services ??= openDatabase()
    .then((db) => {
      const blobs = new IndexedDbBlobStore(db);
      return {
        blobs,
        logos: new IndexedDbLogoLibrary(db, blobs, browserLogoProcessor),
        photos: new IndexedDbPhotoLibrary(db, blobs, browserPhotoProcessor),
        projects: new IndexedDbProjectStore(db),
        session: new IndexedDbSessionStore(db),
      };
    })
    .catch((e: unknown) => {
      services = null; // let a later call retry (e.g. after closing a blocking tab)
      throw e;
    });
  return services;
}
