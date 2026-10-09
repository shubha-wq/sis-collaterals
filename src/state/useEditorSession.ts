import { useEffect, useState, useSyncExternalStore } from "react";
import { createBlankProject } from "@/model/blank";
import { MemoryProjectStore, MemorySessionStore } from "@/persistence/memory";
import { STORAGE_CLOSED_EVENT } from "@/persistence/idb";
import { getServices, type Services } from "@/services";
import { SessionController, type SessionView } from "./sessionController";

export interface EditorSession {
  view: SessionView;
  controller: SessionController | null;
  /** Set when browser storage can't be opened: editing works, drafts don't persist. */
  storageError: string;
  /** Storage services, or null when unavailable. */
  services: Services | null;
}

const idle: SessionView = { project: createBlankProject("starting"), draftId: null, status: "unsaved", lastSavedAt: null, loading: true, libraryDirty: false, recovery: null };
const noop = () => () => {};

/** Creates the session once, starts it, and keeps pending autosaves from being lost on tab close. */
export function useEditorSession(): EditorSession {
  const [controller, setController] = useState<SessionController | null>(null);
  const [storageError, setStorageError] = useState("");
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    let live = true;
    const begin = async (c: SessionController) => {
      await c.start();
      if (live) setController(c);
    };
    getServices()
      .then((s) => {
        if (live) setServices(s);
        return begin(new SessionController({ projects: s.projects, session: s.session }));
      })
      .catch((e: unknown) => {
        if (!live) return;
        setStorageError(
          (e instanceof Error ? e.message + " " : "") + "Drafts can't be saved in this browser window; your work will be lost when you close it.",
        );
        void begin(new SessionController({ projects: new MemoryProjectStore(), session: new MemorySessionStore() }));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onClosed = () =>
      setStorageError("A newer version of this app was opened in another tab, so this tab can't save any more. Reload this tab to keep working; your saved drafts are safe.");
    window.addEventListener(STORAGE_CLOSED_EVENT, onClosed);
    return () => window.removeEventListener(STORAGE_CLOSED_EVENT, onClosed);
  }, []);

  useEffect(() => {
    if (!controller) return;
    const onHide = () => void controller.flush();
    // Unsaved work isn't stored anywhere, so warn before the tab closes.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.hasUnsavedWork()) e.preventDefault();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [controller]);

  const view = useSyncExternalStore(controller?.subscribe ?? noop, controller?.getSnapshot ?? (() => idle));
  return { view, controller, storageError, services };
}
