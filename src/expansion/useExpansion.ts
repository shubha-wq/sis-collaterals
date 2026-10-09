import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { OUTPUTS, isWebOutput } from "@/model/outputs";
import type { Project } from "@/model/project";
import { webFraming } from "@/model/webFraming";
import type { Edit } from "@/state/edits";
import type { TemplateImages } from "@/templates/types";
import { landscapeNeed, type LandscapeNeed } from "./landscape";
import type { ExpansionManager } from "./manager";
import type { ExpansionStatus } from "./types";

const IDLE: ExpansionStatus = { state: "idle" };

/**
 * Editor glue: when a website output shows a whole photo that needs an AI
 * landscape, ask the manager for it (once per source photo and size; shared
 * by Listing and Banner) and record the result on the project. Instagram
 * never triggers generation; neither do text, logo, colour or focus edits.
 */
export function useExpansion(project: Project, images: TemplateImages, manager: ExpansionManager | null, edit: (e: Edit) => void): { images: TemplateImages; need: LandscapeNeed | null; retry: () => void } {
  const output = project.style.output ?? "instagram";
  const photo = images.photo.state === "ready" ? images.photo.image : null;
  const subscribe = useCallback((fn: () => void) => (manager ? manager.subscribe(fn) : () => {}), [manager]);
  // Re-render on manager changes; the status is read below for the current key.
  useSyncExternalStore(subscribe, () => (manager ? manager.version : 0));

  let need: LandscapeNeed | null = null;
  let withStatus = images;
  if (isWebOutput(output) && photo) {
    const { width, height } = OUTPUTS[output];
    const framing = webFraming(project, output, photo);
    const pre = landscapeNeed(project, images, framing, width, height);
    const status = pre.kind === "needed" && manager ? manager.status(pre.key) : IDLE;
    withStatus = { ...images, expansionStatus: status };
    need = landscapeNeed(project, withStatus, framing, width, height);
  }

  const latestKey = useRef<string | null>(null);
  latestKey.current = need?.kind === "needed" ? need.key : null;
  const source = project.photo.source;
  const current = project.photo.expansion;
  const run = useCallback(
    (retry: boolean) => {
      if (!manager || !need || need.kind !== "needed" || need.ready || !source || !photo) return;
      const args = { source, sourceUrl: photo.url, spec: need.spec, current };
      void (retry ? manager.retry(args) : manager.ensure(args)).then((rec) => {
        // Only record it if the creative still wants this exact landscape.
        if (rec && latestKey.current === rec.key && current?.key !== rec.key) edit({ type: "photo-expansion", expansion: rec });
      });
    },
    [manager, need, source, photo, current, edit],
  );

  const key = need?.kind === "needed" && !need.ready && need.status.state === "idle" ? need.key : null;
  useEffect(() => {
    if (key) run(false);
    // Start once per key; run() changes identity on every render.
  }, [key]);

  return { images: withStatus, need, retry: () => run(true) };
}
