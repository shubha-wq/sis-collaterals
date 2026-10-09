import { createBlankProject, hasEventContent, newProjectId, normalizeProject } from "@/model/blank";
import { DraftReadError } from "@/model/migrate";
import type { Project } from "@/model/project";
import type { ProjectStore, SessionStore } from "@/persistence/types";
import { applyEdit, type Edit } from "./edits";

/**
 * Owns the creative being edited and the rules for keeping it:
 *
 * - Launch: reopen the saved draft that was open last time, otherwise start
 *   blank. Unsaved work is never stored, so it can never be restored.
 * - Before Save draft: nothing is written to storage.
 * - After Save draft: every edit autosaves to that draft.
 * - New creative: a genuinely blank project; only output, template and format carry over.
 *
 * Everything persistent goes through ProjectStore / SessionStore, which are
 * per browser. The shared Creative Library (library/) is separate: a
 * creative opened from it or saved to it carries `project.library`, and
 * library saves are always explicit (never autosaved), so editing never
 * creates duplicate library records.
 */

export type SaveStatus = "unsaved" | "saving" | "saved" | "error";

export interface SessionView {
  project: Project;
  /** Set once the person saves; null for a creative that only exists in this tab. */
  draftId: string | null;
  status: SaveStatus;
  lastSavedAt: string | null;
  /** True while start() is reading storage. */
  loading: boolean;
  /** The creative is in the Creative Library and has edits not yet saved there. */
  libraryDirty: boolean;
  /** A saved draft that couldn't be opened safely. Its stored data is untouched. */
  recovery: { draftId: string; reason: string } | null;
}

/** Edits made after the creative was last saved to the library (by draft timestamps). */
function dirtySinceLibrary(p: Project): boolean {
  return !!p.library && p.updatedAt > p.library.savedAt;
}

export interface SessionDeps {
  projects: ProjectStore;
  session: SessionStore;
  now?: () => Date;
  newId?: () => string;
  /** Delay before an edit to a saved draft is written. */
  autosaveMs?: number;
}

export class SessionController {
  private view: SessionView;
  private listeners = new Set<() => void>();
  private readonly deps: Required<SessionDeps>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(deps: SessionDeps) {
    this.deps = { now: () => new Date(), newId: newProjectId, autosaveMs: 600, ...deps };
    this.view = { project: this.blank(), draftId: null, status: "unsaved", lastSavedAt: null, loading: true, libraryDirty: false, recovery: null };
  }

  // ---- store protocol (useSyncExternalStore) ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): SessionView => this.view;

  private set(next: Partial<SessionView>) {
    this.view = { ...this.view, ...next };
    this.listeners.forEach((l) => l());
  }

  private blank(carry?: Project["style"]): Project {
    return createBlankProject(this.deps.newId(), this.deps.now(), carry ? { output: carry.output, template: carry.template, format: carry.format } : undefined);
  }

  // ---- lifecycle ----
  /**
   * Launch: reopen the last saved draft. Never destructive: if that draft
   * can't be read safely, the editor opens blank WITHOUT a draft attached
   * (so nothing can overwrite it), the stored record is left as it was, and
   * a recovery message is shown.
   */
  async start(): Promise<void> {
    let project: Project | null = null;
    let recovery: SessionView["recovery"] = null;
    try {
      const lastId = await this.deps.session.getLastOpenedDraft();
      if (lastId) {
        try {
          project = await this.deps.projects.loadProject(lastId);
        } catch (e) {
          recovery = { draftId: lastId, reason: e instanceof DraftReadError ? e.reason : "Browser storage couldn't be read." };
        }
        // Only forget the pointer when the draft is genuinely gone (never for a read problem).
        if (!project && !recovery) await this.deps.session.setLastOpenedDraft(null);
      }
    } catch {
      project = null;
    }
    if (project) this.set({ project, draftId: project.id, status: "saved", lastSavedAt: project.updatedAt, loading: false, libraryDirty: dirtySinceLibrary(project), recovery: null });
    else this.set({ loading: false, recovery });
  }

  /** Opens a creative restored from a project backup (already saved as a draft). */
  async openRestored(project: Project): Promise<void> {
    await this.flush();
    this.cancelTimer();
    this.set({ project, draftId: project.id, status: "saved", lastSavedAt: project.updatedAt, libraryDirty: dirtySinceLibrary(project), recovery: null });
    await this.deps.session.setLastOpenedDraft(project.id);
  }

  /** Hide the recovery message (the stored draft stays as it is). */
  async dismissRecovery(): Promise<void> {
    const id = this.view.recovery?.draftId;
    this.set({ recovery: null });
    if (id && (await this.deps.session.getLastOpenedDraft()) === id) await this.deps.session.setLastOpenedDraft(null);
  }

  /** The stored record of a draft exactly as saved (for downloading a recovery copy). */
  rawDraft(id: string): Promise<unknown> {
    return this.deps.projects.loadRawProject(id);
  }

  /** Try the last failed save again. */
  async retrySave(): Promise<void> {
    if (!this.view.draftId) return;
    this.cancelTimer();
    await this.write();
  }

  /** Apply an edit now; the canvas re-renders immediately. Saved drafts autosave. */
  edit(e: Edit): void {
    const project = applyEdit(this.view.project, e);
    if (project === this.view.project) return;
    this.set({ project, status: this.view.draftId ? "saving" : "unsaved", libraryDirty: !!project.library });
    if (this.view.draftId) this.scheduleSave();
  }

  /** True when leaving this creative would lose something. */
  hasUnsavedWork(): boolean {
    // A saved draft: only at risk if its last save failed or one is waiting to run.
    if (this.view.draftId !== null) return this.view.status === "error" || this.timer !== null;
    // Unchanged since it was opened from (or saved to) the Creative Library: nothing to lose.
    if (this.view.project.library && !this.view.libraryDirty) return false;
    return hasEventContent(this.view.project);
  }

  /** Makes a creative from the Creative Library the current one. It isn't a local draft unless saved as one. */
  async openCreative(project: Project): Promise<void> {
    await this.flush();
    this.cancelTimer();
    this.set({ project: normalizeProject(project), draftId: null, status: "unsaved", lastSavedAt: null, libraryDirty: false });
    await this.deps.session.setLastOpenedDraft(null);
  }

  /**
   * After a library save: adopt the saved project (its library link, and a
   * new id after Save as new). A local draft of the same creative keeps
   * autosaving; after Save as new the original's draft is left as it was.
   */
  async librarySaved(saved: Project): Promise<void> {
    const sameCreative = saved.id === this.view.project.id;
    // Keep any edits made while the save was in flight.
    const project = { ...this.view.project, id: saved.id, createdAt: saved.createdAt, library: saved.library };
    const stillDirty = JSON.stringify({ ...this.view.project, library: undefined, id: undefined, createdAt: undefined, updatedAt: undefined }) !== JSON.stringify({ ...saved, library: undefined, id: undefined, createdAt: undefined, updatedAt: undefined });
    if (sameCreative) {
      this.set({ project, libraryDirty: stillDirty });
      if (this.view.draftId) await this.write();
    } else {
      this.cancelTimer();
      this.set({ project, draftId: null, status: "unsaved", lastSavedAt: null, libraryDirty: stillDirty });
      await this.deps.session.setLastOpenedDraft(null);
    }
  }

  /** Explicit save. Turns the current creative into a draft that autosaves from now on. */
  async saveDraft(name?: string): Promise<void> {
    if (name !== undefined) this.view = { ...this.view, project: applyEdit(this.view.project, { type: "rename", name }) };
    this.set({ draftId: this.view.project.id });
    await this.write();
    await this.deps.session.setLastOpenedDraft(this.view.project.id);
  }

  async newCreative(): Promise<void> {
    await this.flush();
    const project = this.blank(this.view.project.style);
    this.set({ project, draftId: null, status: "unsaved", lastSavedAt: null, libraryDirty: false });
    await this.deps.session.setLastOpenedDraft(null);
  }

  /** Opens a saved draft. A draft that can't be read safely is reported (recovery), never replaced. */
  async openDraft(id: string): Promise<boolean> {
    await this.flush();
    let project: Project | null;
    try {
      project = await this.deps.projects.loadProject(id);
    } catch (e) {
      this.set({ recovery: { draftId: id, reason: e instanceof DraftReadError ? e.reason : "Browser storage couldn't be read." } });
      return false;
    }
    if (!project) return false;
    this.set({ project, draftId: id, status: "saved", lastSavedAt: project.updatedAt, libraryDirty: dirtySinceLibrary(project), recovery: null });
    await this.deps.session.setLastOpenedDraft(id);
    return true;
  }

  /** Deleting the open draft keeps it on screen as unsaved work, so nothing vanishes mid-edit. */
  async deleteDraft(id: string): Promise<void> {
    if (this.view.draftId === id) {
      this.cancelTimer();
      this.set({ draftId: null, status: "unsaved", lastSavedAt: null });
      await this.deps.session.setLastOpenedDraft(null);
    }
    await this.deps.projects.deleteProject(id);
  }

  /** Writes any pending autosave now (page hide, switching creatives). */
  async flush(): Promise<void> {
    if (this.timer) {
      this.cancelTimer();
      await this.write();
    }
    await this.writing;
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleSave() {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write();
    }, this.deps.autosaveMs);
  }

  /**
   * Writes the open draft. Only ever writes the project that IS that draft
   * (same id), so a blank or different creative can never overwrite a saved
   * one. "Saved" is shown only after the write succeeds; on failure the
   * edits stay in memory, the status is "error", and retrySave() tries again.
   */
  private write(): Promise<void> {
    if (!this.view.draftId || this.view.project.id !== this.view.draftId) return this.writing;
    const stamp = this.deps.now().toISOString();
    const project = { ...this.view.project, updatedAt: stamp };
    this.view = { ...this.view, project };
    this.set({ status: "saving" });
    this.writing = this.writing
      .then(() => this.deps.projects.saveProject(project))
      .then(
        () => {
          if (this.view.project.id === project.id && !this.timer) this.set({ status: "saved", lastSavedAt: stamp });
        },
        () => this.set({ status: "error" }),
      );
    return this.writing;
  }
}
