import { useEffect, useState } from "react";
import type { BlobStore } from "@/persistence/types";
import { connectLibrary, type LibraryConnection } from "../connect";

export interface LibraryState {
  connection: LibraryConnection | null;
  /** Signed-in team email (shared library), "preview" for the dev preview, null when signed out. */
  email: string | null;
  /** True when saving and opening are possible right now. */
  ready: boolean;
}

/** Connects to the Creative Library once the browser's blob store is available, and follows sign-in. */
export function useLibrary(blobs: BlobStore | null): LibraryState {
  const [connection, setConnection] = useState<LibraryConnection | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!blobs) return;
    let live = true;
    let off = () => {};
    void connectLibrary(blobs).then(async (c) => {
      if (!live) return;
      setConnection(c);
      if (c.kind === "preview") setEmail("preview");
      if (c.kind === "shared") {
        setEmail(await c.auth.currentEmail());
        off = c.auth.onChange((e) => live && setEmail(e));
      }
    });
    return () => {
      live = false;
      off();
    };
  }, [blobs]);

  const ready = !!connection && connection.kind !== "not-configured" && !!email;
  return { connection, email, ready };
}
