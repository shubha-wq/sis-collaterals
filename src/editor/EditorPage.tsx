import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTemplateImages } from "@/assets/useTemplateImages";
import { ExpansionManager } from "@/expansion/manager";
import { HttpExpansionService, preparePhoto } from "@/expansion/http";
import { MockExpansionService } from "@/expansion/mock";
import { useExpansion } from "@/expansion/useExpansion";
import { hasEventContent } from "@/model/blank";
import { Wordmark } from "@/design-system/components/Wordmark";
import type { FitResult } from "@/layout/types";
import { resolveFill } from "@/layout/webPhotoPlan";
import { OUTPUTS, isWebOutput } from "@/model/outputs";
import { webFraming } from "@/model/webFraming";
import type { Edit } from "@/state/edits";
import { useEditorSession } from "@/state/useEditorSession";
import { outputOf, rendererFor } from "@/templates/outputs";
import { reviewProject } from "@/validation/projectChecks";
import { CanvasStage } from "./CanvasStage";
import { sameReadings, type ContrastReading } from "@/templates/shared/contrast";
import { DraftBar, type ProjectFileActions } from "./DraftBar";
import { BackupError, backupBlob, backupFileName, createBackup, restoreBackup } from "@/persistence/backup";
import { downloadBlob } from "@/export/render";
import { ConfirmDialog } from "./ConfirmDialog";
import { LibraryBar } from "@/library/ui/LibraryBar";
import { CreativeLibraryView } from "@/library/ui/CreativeLibraryView";
import { useLibrary } from "@/library/ui/useLibrary";
import { LibraryError } from "@/library/types";
import { DownloadButton } from "./DownloadButton";
import { exportReadiness } from "@/export/gate";
import { BANNER_FIELDS, ContentSection } from "./sections/ContentSection";
import { OutputSection } from "./sections/OutputSection";
import { LogosSection } from "./sections/LogosSection";
import { PhotoSection } from "./sections/PhotoSection";
import { DetailsSection, FineTuneSection, StyleSection } from "./sections/StyleSections";

type SectionId = "content" | "photo" | "logos" | "style" | "details" | "fine";

/**
 * The editor. Opens on a blank creative (or the last saved draft). Every
 * edit applies immediately and the canvas recomposes from the content.
 */
export function EditorPage() {
  const { view, controller, storageError, services } = useEditorSession();
  const project = view.project;
  const [open, setOpen] = useState<SectionId | null>(null);
  // Each blank creative (first launch or New creative) opens on Content, so
  // the first step is obvious. A reopened draft starts with everything collapsed.
  const lastProjectId = useRef<string | null>(null);
  useEffect(() => {
    if (view.loading || lastProjectId.current === project.id) return;
    lastProjectId.current = project.id;
    setOpen(hasEventContent(project) ? null : "content");
  }, [view.loading, project]);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [contrast, setContrast] = useState<ContrastReading[]>([]);
  const onContrast = useCallback((r: ContrastReading[]) => setContrast((prev) => (sameReadings(prev, r) ? prev : r)), []);
  const baseImages = useTemplateImages(project, services?.blobs ?? null);

  const edit = useCallback((e: Edit) => controller?.edit(e), [controller]);

  // ---- AI landscape for the website outputs (generated once per photo, shared by Listing and Banner) ----
  const expansionManager = useMemo(
    () =>
      services
        ? new ExpansionManager({
            service: import.meta.env.VITE_IMAGE_EXPANSION === "mock" ? new MockExpansionService() : new HttpExpansionService(),
            blobs: services.blobs,
            prepare: preparePhoto,
          })
        : null,
    [services],
  );
  const { images, need: landscape, retry: retryLandscape } = useExpansion(project, baseImages, expansionManager, edit);
  // Dev-only diagnostics (how many landscapes were generated, and for which keys).
  if (import.meta.env.DEV && expansionManager) (window as unknown as { __expansion?: ExpansionManager }).__expansion = expansionManager;

  // ---- Project files (editable backup with all files; not the PNG) ----
  const projectFile = useMemo<ProjectFileActions | null>(() => {
    if (!services || !controller) return null;
    return {
      exportCurrent: async () => {
        const backup = await createBackup(controller.getSnapshot().project, services.blobs);
        downloadBlob(backupBlob(backup), backupFileName(controller.getSnapshot().project));
      },
      importFile: async (file: File) => {
        let json: unknown;
        try {
          json = JSON.parse(await file.text());
        } catch {
          throw new BackupError("That file isn't an SIS Collaterals project file.");
        }
        const restored = await restoreBackup(json, { blobs: services.blobs, projects: services.projects, logos: services.logos, photos: services.photos });
        await controller.openRestored(restored);
      },
    };
  }, [services, controller]);

  // ---- Creative Library (shared) ----
  const lib = useLibrary(services?.blobs ?? null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<{ id: string; version?: number } | null>(null);
  // A note about the creative just opened; shown only while that creative is open.
  const [openNotice, setOpenNotice] = useState<{ id: string | null; text: string } | null>(null);
  const openFromLibrary = useCallback(
    async (id: string, version?: number) => {
      const conn = lib.connection;
      if (!controller || !conn || conn.kind === "not-configured") return;
      setPendingOpen(null);
      try {
        const opened = await conn.library.open(id, version);
        await controller.openCreative(opened.project);
        setLibraryOpen(false);
        const notes = [
          opened.restoredFrom ? `Opened version ${opened.restoredFrom}. Save changes makes it the current version (the current one is kept).` : "",
          opened.missing.length ? `Couldn't find ${opened.missing.join(", ")} in team storage. Re-upload to download this creative.` : "",
        ].filter(Boolean);
        setOpenNotice(notes.length ? { id: opened.project.id, text: notes.join(" ") } : null);
      } catch (e) {
        setOpenNotice({ id: null, text: e instanceof LibraryError ? e.message : "That creative couldn't be opened. Try again." });
      }
    },
    [controller, lib.connection],
  );
  const requestOpen = (id: string, version?: number) => {
    if (controller?.hasUnsavedWork()) setPendingOpen({ id, version });
    else void openFromLibrary(id, version);
  };
  const notice = openNotice && (openNotice.id === null || openNotice.id === project.id) ? openNotice.text : "";
  const toggle = (id: SectionId) => () => setOpen((cur) => (cur === id ? null : id));
  const listDrafts = useCallback(async () => (services ? services.projects.listProjects() : []), [services]);
  const onFit = useCallback((r: FitResult) => setFit((prev) => (prev?.status === r.status && prev.step === r.step ? prev : r)), []);

  const issues = useMemo(() => reviewProject(project, images, fit, contrast), [project, images, fit, contrast]);
  const blocking = issues.filter((i) => i.level === "blocking");
  const readiness = useMemo(() => exportReadiness(issues, images), [issues, images]);
  const renderer = rendererFor(project);
  const output = outputOf(project);
  const disabled = !controller;
  const web = useMemo(() => {
    if (!isWebOutput(output)) return undefined;
    const img = images.photo.state === "ready" ? images.photo.image : null;
    const framing = webFraming(project, output, img);
    const { width, height } = OUTPUTS[output];
    return { output, framing, resolved: img ? resolveFill(framing, img.width, img.height, width, height) : null, landscape, onRetry: retryLandscape, provider: project.photo.expansion?.provider };
  }, [output, project, images.photo, landscape, retryLandscape]);

  const photoSection = <PhotoSection photo={project.photo} edit={edit} library={services?.photos ?? null} blobs={services?.blobs ?? null} open={open === "photo"} onToggle={toggle("photo")} web={web} />;
  const logosSection = <LogosSection logos={project.logos} edit={edit} library={services?.logos ?? null} open={open === "logos"} onToggle={toggle("logos")} />;

  return (
    <div className="editor">
      <aside className="editor-panel" aria-label="Controls">
        <div className="editor-brand">
          <Wordmark size={22} />
          <span className="label">Marketing collaterals</span>
        </div>
        <fieldset className="panel-sections" disabled={disabled}>
          <OutputSection output={output} edit={edit} />
          {output === "instagram" && (
            <>
              <ContentSection project={project} edit={edit} open={open === "content"} onToggle={toggle("content")} />
              {photoSection}
              {logosSection}
              <StyleSection project={project} edit={edit} open={open === "style"} onToggle={toggle("style")} />
              <DetailsSection project={project} open={open === "details"} onToggle={toggle("details")} />
              <FineTuneSection project={project} edit={edit} open={open === "fine"} onToggle={toggle("fine")} />
            </>
          )}
          {output === "website-banner" && (
            <>
              <ContentSection project={project} edit={edit} open={open === "content"} onToggle={toggle("content")} only={BANNER_FIELDS} intro="Everything is optional. Whatever you add sits inside the orange arc; the arc grows to fit it." />
              {photoSection}
              {logosSection}
            </>
          )}
          {output === "website-listing" && photoSection}
        </fieldset>
      </aside>
      <main className="editor-stage">
        <DraftBar view={view} controller={controller} listDrafts={listDrafts} projectFile={projectFile} />
        <LibraryBar view={view} controller={controller} lib={lib} images={images} onOpenLibrary={() => setLibraryOpen(true)} />
        {notice && (
          <p className="library-opened" role="status">
            {notice}
          </p>
        )}
        {storageError && <p className="storage-error" role="alert">{storageError}</p>}
        <div className="stage-heading">
          <div className="stage-heading-text">
            <strong>{output === "instagram" ? `${OUTPUTS.instagram.label} · ${renderer.label}` : renderer.label}</strong>
            <span className="muted">{output === "instagram" ? `${renderer.width} × ${renderer.height}` : renderer.description}</span>
          </div>
          <DownloadButton project={project} images={images} readiness={readiness} />
        </div>
        <CanvasStage project={project} images={images} onFit={onFit} onContrast={onContrast} />
        <section className="review" aria-label="Review" data-state={blocking.length ? "blocking" : issues.length ? "warnings" : "ready"}>
          <strong>{blocking.length ? "Needed before download" : issues.length ? `Check · ${issues.length}` : "Ready to download"}</strong>
          {issues.map((i) => (
            <p key={i.id} className={i.level === "blocking" ? "review-blocking" : "review-warning"}>
              {i.level === "blocking" ? "Needed: " : ""}
              {i.message}
            </p>
          ))}
        </section>
      </main>
      {libraryOpen && <CreativeLibraryView lib={lib} onClose={() => setLibraryOpen(false)} onOpen={requestOpen} />}
      {pendingOpen && (
        <ConfirmDialog
          title="Discard this creative?"
          body="The creative you're working on hasn't been saved as a draft or to the Creative Library, so its changes will be lost."
          confirmLabel="Discard and open"
          onCancel={() => setPendingOpen(null)}
          onConfirm={() => void openFromLibrary(pendingOpen.id, pendingOpen.version)}
        />
      )}
    </div>
  );
}
