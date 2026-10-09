import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { FitResult } from "@/layout/types";
import type { Project } from "@/model/project";
import { rendererFor } from "@/templates/outputs";
import type { TemplateImages } from "@/templates/types";
import { ExportError, renderPng } from "./render";

export interface ExportedImage {
  blob: Blob;
  width: number;
  height: number;
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Dev-only step timings, for diagnosing slow exports (window.__exportTrace). */
function trace(step: string) {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __exportTrace?: string[] };
  (w.__exportTrace ??= []).push(`${step}@${Math.round(performance.now())}`);
}

/** Waits (up to 15 s) until no layer is marked data-pending. */
async function layersReady(node: HTMLElement): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (node.querySelector('[data-pending="true"]') && performance.now() < deadline) await settle(50);
  if (node.querySelector('[data-pending="true"]')) throw new ExportError("The photo couldn't be prepared. Try again.");
}

/**
 * Renders the creative in export mode (no editor hints) at exact size in a
 * hidden, untransformed stage, waits for fonts, images and the fit to settle,
 * then captures it. The layout engine is the same one the editor uses, so the
 * export matches what's on screen.
 */
export async function exportCreative(project: Project, images: TemplateImages): Promise<ExportedImage> {
  const renderer = rendererFor(project);
  const Component = renderer.Component;
  if (!Component) throw new ExportError(`${renderer.label} isn't available to export.`);
  const { width, height } = renderer;

  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.dataset.exportStage = "true";
  // Off-screen but laid out normally (not display:none), at 1:1 scale.
  Object.assign(stage.style, { position: "fixed", left: "-100000px", top: "0", width: `${width}px`, height: `${height}px`, overflow: "hidden", pointerEvents: "none" });
  document.body.appendChild(stage);
  const root = createRoot(stage);
  let fit: FitResult | null = null;
  try {
    trace("start");
    flushSync(() => root.render(<Component project={project} images={images} mode="export" onFit={(r) => (fit = r)} />));
    const node = stage.querySelector<HTMLElement>(".tpl-canvas");
    if (!node) throw new ExportError("The creative couldn't be prepared for export.");
    // Fonts change text metrics, so let the fit loop run again once they're ready.
    await document.fonts.ready;
    trace("fonts");
    await settle(60);
    // Website outputs prepare the photo's edge extension asynchronously.
    await layersReady(node);
    trace("settled");
    // Never export a clipped or overflowing composition.
    if ((fit as FitResult | null)?.status === "cannot-fit" || node.dataset.fit === "cannot-fit") {
      throw new ExportError("There's more text than fits. Shorten the headline or details, then download again.");
    }
    const blob = await renderPng(node, width, height);
    trace("rendered");
    return { blob, width, height };
  } finally {
    root.unmount();
    stage.remove();
  }
}
