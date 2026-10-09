import { useState } from "react";
import { Button } from "@/design-system/components/Button";
import { exportCreative } from "@/export/exportCreative";
import { exportFileName } from "@/export/filename";
import type { ExportReadiness } from "@/export/gate";
import { ExportError, downloadBlob } from "@/export/render";
import type { Project } from "@/model/project";
import type { TemplateImages } from "@/templates/types";

type State = { kind: "idle" } | { kind: "working" } | { kind: "done"; name: string } | { kind: "error"; message: string };

/**
 * The one primary action: download the creative as a PNG at exact export
 * size. Disabled, with the reason, while something would make the image
 * wrong; advisory warnings never disable it.
 */
export function DownloadButton({ project, images, readiness }: { project: Project; images: TemplateImages; readiness: ExportReadiness }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const working = state.kind === "working";

  const download = async () => {
    if (!readiness.ok || working) return;
    setState({ kind: "working" });
    try {
      const { blob } = await exportCreative(project, images);
      const name = exportFileName(project);
      downloadBlob(blob, name);
      setState({ kind: "done", name });
    } catch (e) {
      setState({ kind: "error", message: e instanceof ExportError ? e.message : "The download didn't work. Try again." });
    }
  };

  return (
    <div className="download">
      <Button variant="primary" className="download-btn" disabled={!readiness.ok || working} aria-describedby="download-status" onClick={() => void download()}>
        {working ? "Preparing…" : "Download"}
      </Button>
      <p id="download-status" className="download-status" role="status" aria-live="polite" data-state={state.kind}>
        {!readiness.ok
          ? "Fix the items marked “Needed” below to download."
          : state.kind === "working"
            ? "Preparing your PNG…"
            : state.kind === "done"
            ? `Downloaded ${state.name}`
            : state.kind === "error"
              ? state.message
              : "PNG, exact size, ready to post."}
      </p>
    </div>
  );
}
