import { useState } from "react";
import { Button } from "@/design-system/components/Button";
import { hasEventContent } from "@/model/blank";
import type { ProjectSummary } from "@/persistence/types";
import type { SessionController, SessionView } from "@/state/sessionController";
import { ConfirmDialog } from "./ConfirmDialog";
import { requestPersistentStorage } from "@/persistence/storageStatus";

/** Project files: the editable creative + its photos and logos (not the PNG). */
export interface ProjectFileActions {
  exportCurrent: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
}

interface DraftBarProps {
  view: SessionView;
  controller: SessionController | null;
  listDrafts: () => Promise<ProjectSummary[]>;
  projectFile: ProjectFileActions | null;
}

function statusLabel(view: SessionView): string {
  if (view.loading) return "Opening…";
  if (view.status === "error") return "Save failed. Your changes are still here.";
  if (view.draftId) return view.status === "saving" ? "Saving…" : "Saved · changes save automatically";
  return hasEventContent(view.project) ? "Not saved yet" : "New creative";
}

/** Downloads a stored draft exactly as saved (for a draft that can't be opened). */
async function downloadRaw(controller: SessionController, id: string) {
  const raw = await controller.rawDraft(id);
  const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `SIS_draft-recovery_${id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Pending = { kind: "new" } | { kind: "open"; id: string } | { kind: "delete"; id: string; name: string } | { kind: "import"; file: File } | null;

/** New creative · Save draft · Drafts. Saving is always an explicit choice. */
export function DraftBar({ view, controller, listDrafts, projectFile }: DraftBarProps) {
  const [drafts, setDrafts] = useState<ProjectSummary[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [fileMsg, setFileMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const ready = !!controller && !view.loading;
  const canSave = ready && !view.draftId && hasEventContent(view.project);

  const toggleDrafts = async () => setDrafts(drafts ? null : await listDrafts());

  const guard = (next: Exclude<Pending, null>) => {
    if (!controller) return;
    if (next.kind !== "delete" && controller.hasUnsavedWork()) setPending(next);
    else void run(next);
  };

  const run = async (action: Exclude<Pending, null>) => {
    setPending(null);
    if (!controller) return;
    if (action.kind === "new") await controller.newCreative();
    if (action.kind === "open") await controller.openDraft(action.id);
    if (action.kind === "delete") await controller.deleteDraft(action.id);
    if (action.kind === "import" && projectFile) {
      try {
        await projectFile.importFile(action.file);
        setFileMsg({ kind: "ok", text: `Restored “${action.file.name}” as a saved draft.` });
      } catch (e) {
        setFileMsg({ kind: "error", text: e instanceof Error ? e.message : "That project file couldn't be imported." });
      }
    }
    setDrafts(action.kind === "delete" ? await listDrafts() : null);
  };

  const exportFile = async () => {
    if (!projectFile) return;
    try {
      await projectFile.exportCurrent();
      setFileMsg({ kind: "ok", text: "Project file downloaded. Keep it to restore this creative in any browser." });
    } catch (e) {
      setFileMsg({ kind: "error", text: e instanceof Error ? e.message : "The project file couldn't be made." });
    }
  };

  return (
    <div className="draft-bar">
      <span className="draft-status" role="status" aria-live="polite" data-status={view.draftId ? view.status : "unsaved"}>
        {statusLabel(view)}
        {view.status === "error" && view.draftId && (
          <button type="button" className="link-button draft-retry" onClick={() => void controller?.retrySave()}>
            Retry
          </button>
        )}
      </span>
      <div className="draft-actions">
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => guard({ kind: "new" })}>
          New creative
        </Button>
        <Button variant="ghost" size="sm" disabled={!ready} aria-expanded={!!drafts} onClick={() => void toggleDrafts()}>
          Drafts (this browser)
        </Button>
        {!view.draftId && (
          <Button variant="secondary" size="sm" disabled={!canSave} title={canSave ? undefined : "Add something to the creative first"} onClick={() => {
              void controller?.saveDraft();
              // Ask the browser not to evict saved drafts under storage pressure (Safari especially).
              void requestPersistentStorage();
            }}>
            Save draft
          </Button>
        )}
      </div>

      {view.recovery && controller && (
        <div className="draft-recovery" role="alert">
          <strong>A saved draft couldn't be opened.</strong>
          <span>{view.recovery.reason} Nothing was deleted or overwritten: it's kept unchanged in this browser.</span>
          <span className="draft-recovery-actions">
            <button type="button" className="link-button" onClick={() => void downloadRaw(controller, view.recovery!.draftId)}>
              Download a recovery copy
            </button>
            <button type="button" className="link-button" onClick={() => void controller.dismissRecovery()}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      {drafts && (
        <div className="drafts-list" aria-label="Saved drafts">
          {drafts.length === 0 && <p className="muted">No saved drafts in this browser yet.</p>}
          {drafts.map((d) => (
            <div key={d.id} className="drafts-row" aria-current={d.id === view.draftId ? "true" : undefined} data-needs-recovery={d.needsRecovery ? "true" : undefined}>
              <button
                type="button"
                className="drafts-open"
                title={d.needsRecovery}
                onClick={() => (d.needsRecovery ? controller && void downloadRaw(controller, d.id) : d.id !== view.draftId && guard({ kind: "open", id: d.id }))}
              >
                <span>{d.name}</span>
                <span className="muted">{d.needsRecovery ? "Can't be opened · click to download a recovery copy" : new Date(d.updatedAt).toLocaleString()}</span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => setPending({ kind: "delete", id: d.id, name: d.name })}>
                Delete
              </Button>
            </div>
          ))}
          <p className="muted">Drafts are saved in this browser only. To move one to another computer, use a project file.</p>
          {projectFile && (
            <div className="project-file">
              <span className="label">Project file · editable, with its photos and logos (not the PNG)</span>
              <span className="project-file-actions">
                <Button variant="ghost" size="sm" disabled={!hasEventContent(view.project)} onClick={() => void exportFile()}>
                  Export this creative
                </Button>
                <label className="ds-btn ds-btn--ghost ds-btn--sm project-file-import">
                  Import project file…
                  <input
                    type="file"
                    accept={`.json,application/json`}
                    aria-label="Import project file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) guard({ kind: "import", file });
                    }}
                  />
                </label>
              </span>
            </div>
          )}
        </div>
      )}
      {fileMsg && (
        <p className={fileMsg.kind === "error" ? "library-bar-error" : "library-bar-ok"} role={fileMsg.kind === "error" ? "alert" : "status"}>
          {fileMsg.text}
        </p>
      )}

      {pending && pending.kind !== "delete" && (
        <ConfirmDialog
          title="Discard this creative?"
          body="It hasn't been saved as a draft, so its content will be lost. Save draft first if you want to keep it."
          confirmLabel="Discard"
          onCancel={() => setPending(null)}
          onConfirm={() => void run(pending)}
        />
      )}
      {pending && pending.kind === "delete" && (
        <ConfirmDialog
          title={`Delete “${pending.name}”?`}
          body="The saved draft is removed from this browser. This can't be undone."
          confirmLabel="Delete draft"
          onCancel={() => setPending(null)}
          onConfirm={() => void run(pending)}
        />
      )}
    </div>
  );
}
