import type { Project } from "@/model/project";
import type { FitResult } from "@/layout/types";
import type { ContrastReading } from "./shared/contrast";
import type { ExpansionStatus } from "@/expansion/types";

/** An image ready to draw, with its natural size for layout decisions. */
export interface DrawableImage {
  url: string;
  width: number;
  height: number;
  /** Logos only: overall tone, for the "may disappear on this background" warning. */
  tone?: "dark" | "light" | "mixed";
}

export type ImageSlot =
  | { state: "empty" }
  | { state: "loading" }
  | { state: "ready"; image: DrawableImage }
  /** The referenced file isn't available. Drawn as a placeholder; export is blocked. */
  | { state: "missing"; name: string };

export interface TemplateImages {
  photo: ImageSlot;
  sis: DrawableImage;
  partners: Array<{ id: string; slot: ImageSlot }>;
  /** The stored AI landscape (project.photo.expansion), resolved to a drawable file. */
  landscape?: ImageSlot;
  /** Generation state for the landscape the current photo needs (editor; absent in QA/export = idle). */
  expansionStatus?: ExpansionStatus;
}

/**
 * Everything a template needs. Templates are pure views of this: no storage,
 * no fetching. `mode: "editor"` may draw hints for empty slots; `"export"`
 * never does, and both are otherwise identical.
 */
export interface TemplateProps {
  project: Project;
  images: TemplateImages;
  mode: "editor" | "export";
  onFit?: (r: FitResult) => void;
  /** Editor only: contrast of text blocks with a chosen colour, measured on the rendered canvas. */
  onContrast?: (readings: ContrastReading[]) => void;
}
