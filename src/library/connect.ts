import type { BlobStore } from "@/persistence/types";
import { MemoryLibraryBackend, MemorySharedAssets } from "./memory";
import { CreativeLibrary } from "./service";

/**
 * Picks the Creative Library backend from the environment:
 *   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY → shared (Supabase)
 *   dev server without them                    → in-memory preview (not shared, labelled as such)
 *   production build without them              → not configured (the UI explains the setup)
 * Supabase is loaded on demand, so it costs the editor nothing until the library is used.
 */
export interface TeamAuth {
  currentEmail(): Promise<string | null>;
  sendSignInLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(fn: (email: string | null) => void): () => void;
}

export type LibraryConnection =
  | { kind: "shared"; library: CreativeLibrary; auth: TeamAuth }
  | { kind: "preview"; library: CreativeLibrary }
  | { kind: "not-configured" };

export function libraryEnv(env: Record<string, string | boolean | undefined> = import.meta.env): { url: string; key: string } | null {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  return url && key ? { url, key } : null;
}

let previewBackend: { backend: MemoryLibraryBackend; assets: MemorySharedAssets } | null = null;
let connection: Promise<LibraryConnection> | null = null;

export function connectLibrary(blobs: BlobStore): Promise<LibraryConnection> {
  connection ??= (async (): Promise<LibraryConnection> => {
    const cfg = libraryEnv();
    if (cfg) {
      const { createSupabase, SupabaseLibraryBackend, SupabaseSharedAssets, SupabaseTeamAuth } = await import("./supabase");
      const db = createSupabase(cfg.url, cfg.key);
      return { kind: "shared", library: new CreativeLibrary({ backend: new SupabaseLibraryBackend(db), assets: new SupabaseSharedAssets(db), blobs }), auth: new SupabaseTeamAuth(db) };
    }
    if (import.meta.env.DEV) {
      previewBackend ??= { backend: new MemoryLibraryBackend(() => new Date(), () => "preview@localhost"), assets: new MemorySharedAssets() };
      return { kind: "preview", library: new CreativeLibrary({ ...previewBackend, blobs }) };
    }
    return { kind: "not-configured" };
  })();
  return connection;
}
