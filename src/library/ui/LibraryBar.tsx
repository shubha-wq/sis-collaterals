import { useState } from "react";
import { Button } from "@/design-system/components/Button";
import { hasEventContent } from "@/model/blank";
import type { SessionController, SessionView } from "@/state/sessionController";
import type { TemplateImages } from "@/templates/types";
import { LibraryError } from "../types";
import { makeThumbnail } from "./thumbnail";
import type { LibraryState } from "./useLibrary";

type Busy = null | "save" | "new";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * The shared side of saving, beside the local Drafts bar:
 *   not in the library yet → Save to Library
 *   opened from / saved to the library → Save changes (same creative, previous version kept) · Save as new
 * Library saves are explicit only; nothing autosaves to the library.
 */
export function LibraryBar({ view, controller, lib, images, onOpenLibrary }: { view: SessionView; controller: SessionController | null; lib: LibraryState; images: TemplateImages; onOpenLibrary: () => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const project = view.project;
  const link = project.library;
  const conn = lib.connection;
  const canSave = lib.ready && !!controller && !view.loading && hasEventContent(project) && busy === null;

  const save = async (mode: "changes" | "new") => {
    if (!controller || !conn || conn.kind === "not-configured") return;
    setBusy(mode === "changes" ? "save" : "new");
    setMessage(null);
    try {
      const thumb = await makeThumbnail(project, images);
      const saved = mode === "changes" && link ? await conn.library.saveChanges(project, thumb) : await conn.library.saveNew(project, thumb);
      await controller.librarySaved(saved);
      setMessage({ kind: "ok", text: mode === "changes" && link ? `Saved changes (version ${saved.library!.version}). The previous version is kept.` : link ? "Saved as a new creative. The original is unchanged." : "Saved to the Creative Library." });
    } catch (e) {
      const text =
        e instanceof LibraryError && e.code === "conflict"
          ? "Someone else saved this creative after you opened it. Use Save as new to keep your version, or reopen it from the Creative Library to see theirs."
          : e instanceof LibraryError
            ? e.message
            : "Couldn't save to the Creative Library. Try again.";
      setMessage({ kind: "error", text });
    } finally {
      setBusy(null);
    }
  };

  let status: string;
  if (!conn) status = "Connecting…";
  else if (conn.kind === "not-configured") status = "Not set up yet";
  else if (!lib.email) status = "Sign in to save and open team creatives";
  else if (!link) status = "Not in the library yet";
  else status = view.libraryDirty ? `Version ${link.version} · unsaved changes` : `Version ${link.version} · saved ${when(link.savedAt)}`;

  return (
    <div className="library-bar" aria-label="Creative Library">
      <div className="library-bar-text">
        <span className="library-bar-title">
          Creative Library <span className="library-bar-kind">{conn?.kind === "preview" ? "preview · not shared" : "shared with the team"}</span>
        </span>
        <span className="library-bar-status" role="status" aria-live="polite" data-dirty={view.libraryDirty ? "true" : undefined}>
          {status}
        </span>
      </div>
      <div className="library-bar-actions">
        <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
          Open Creative Library
        </Button>
        {lib.ready && !link && (
          <Button variant="secondary" size="sm" disabled={!canSave} title={hasEventContent(project) ? undefined : "Add something to the creative first"} onClick={() => void save("new")}>
            {busy === "new" ? "Saving…" : "Save to Library"}
          </Button>
        )}
        {lib.ready && link && (
          <>
            <Button variant="secondary" size="sm" disabled={!canSave || !view.libraryDirty} onClick={() => void save("changes")}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="ghost" size="sm" disabled={!canSave} onClick={() => void save("new")}>
              {busy === "new" ? "Saving…" : "Save as new"}
            </Button>
          </>
        )}
      </div>
      {message && (
        <p className={message.kind === "error" ? "library-bar-error" : "library-bar-ok"} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
