import { useMemo } from "react";
import type { Project } from "@/model/project";

/** The website outputs are 1600 × 1000: the kit's landscape canvas. */
export function useLandscape(project: Project): Project {
  return useMemo(() => (project.style.format === "banner" ? project : { ...project, style: { ...project.style, format: "banner" } }), [project]);
}
