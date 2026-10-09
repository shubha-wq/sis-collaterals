import type { ComponentType } from "react";
import { FORMATS } from "@/model/formats";
import { OUTPUTS, type OutputId } from "@/model/outputs";
import type { Project } from "@/model/project";
import { findTemplate } from "./registry";
import type { TemplateProps } from "./types";
import { WebsiteBanner } from "./website/WebsiteBanner";
import { WebsiteListing } from "./website/WebsiteListing";

/**
 * What to draw for a project, and at what size. Instagram Creative is one of
 * the five templates; the website outputs have their own renderers and
 * never use a template. The editor stage, the export and the QA pages all
 * resolve through here.
 */
export interface Renderer {
  output: OutputId;
  Component: ComponentType<TemplateProps> | null;
  width: number;
  height: number;
  /** e.g. "Block" or "Website Banner". */
  label: string;
  /** e.g. "Instagram Creative · 1080 × 1350". */
  description: string;
}

const WEB_COMPONENTS = { "website-banner": WebsiteBanner, "website-listing": WebsiteListing } as const;

export function outputOf(project: Project): OutputId {
  return project.style.output ?? "instagram";
}

export function rendererFor(project: Project): Renderer {
  const output = outputOf(project);
  const info = OUTPUTS[output];
  if (output === "instagram") {
    const t = findTemplate(project.style.template);
    // The editor keeps Instagram on the feed size; QA also renders the templates' banner compositions.
    const f = FORMATS[project.style.format];
    return { output, Component: t.component, width: f.width, height: f.height, label: t.label, description: `${info.label} · ${f.width} × ${f.height}` };
  }
  return { output, Component: WEB_COMPONENTS[output], width: info.width, height: info.height, label: info.label, description: `${info.width} × ${info.height} · no template` };
}
