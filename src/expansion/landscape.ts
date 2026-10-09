import { planWebPhoto, type WebPhotoPlan } from "@/layout/webPhotoPlan";
import type { WebFraming } from "@/model/outputs";
import type { Project } from "@/model/project";
import type { TemplateImages } from "@/templates/types";
import { expansionKey, expansionSpec, type ExpansionSpec } from "./spec";
import type { ExpansionStatus } from "./types";

/**
 * What a website output needs for its photo right now:
 *   not-needed: the photo fills the frame (crop), or there's no photo;
 *   needed:     the whole photo is shown, so the free sides need the AI
 *               landscape (spec/key), which is ready or not yet.
 */
export type LandscapeNeed =
  | { kind: "not-needed"; plan: WebPhotoPlan | null }
  | { kind: "needed"; plan: WebPhotoPlan; spec: ExpansionSpec; key: string; ready: boolean; status: ExpansionStatus };

export function landscapeNeed(project: Project, images: TemplateImages, framing: WebFraming, outW: number, outH: number): LandscapeNeed {
  const src = images.photo.state === "ready" ? images.photo.image : null;
  if (!src || !project.photo.source) return { kind: "not-needed", plan: null };
  const plan = planWebPhoto(src.width, src.height, outW, outH, framing);
  if (plan.mode !== "fit" || plan.gaps.length === 0) return { kind: "not-needed", plan };
  const spec = expansionSpec(src.width, src.height, outW, outH);
  if (!spec) return { kind: "not-needed", plan };
  const key = expansionKey(project.photo.source, spec);
  const ready = project.photo.expansion?.key === key && images.landscape?.state === "ready";
  const status: ExpansionStatus = ready ? { state: "ready" } : (images.expansionStatus ?? { state: "idle" });
  return { kind: "needed", plan, spec, key, ready, status };
}
