/**
 * What the creative is for. Instagram Creative uses the five templates;
 * the two website outputs have their own fixed compositions and never use
 * the templates. Every output exports at exactly its size.
 */
export type OutputId = "instagram" | "website-banner" | "website-listing";
export type WebOutputId = Exclude<OutputId, "instagram">;

export interface OutputInfo {
  id: OutputId;
  label: string;
  width: number;
  height: number;
  /** One line for the output picker. */
  description: string;
  /** Uses the Instagram templates (Broadsheet, Poster, Block, Slab, Ticket). */
  usesTemplates: boolean;
  /** Filename suffix, e.g. "Website-Banner". */
  fileLabel: string;
}

export const OUTPUTS: Record<OutputId, OutputInfo> = {
  instagram: { id: "instagram", label: "Instagram Creative", width: 1080, height: 1350, description: "Feed post · uses the five templates", usesTemplates: true, fileLabel: "Instagram-Creative" },
  "website-banner": { id: "website-banner", label: "Website Banner", width: 1600, height: 1000, description: "Photo with the SIS arc and event details", usesTemplates: false, fileLabel: "Website-Banner" },
  "website-listing": { id: "website-listing", label: "Website Listing", width: 1600, height: 1000, description: "Photo only · no text, arc or logos", usesTemplates: false, fileLabel: "Website-Listing" },
};

export const OUTPUT_ORDER: readonly OutputId[] = ["instagram", "website-banner", "website-listing"];
export const DEFAULT_OUTPUT: OutputId = "instagram";

export function isWebOutput(id: OutputId): id is WebOutputId {
  return id !== "instagram";
}

/** How a website output treats the photo. */
export type PhotoFill = "auto" | "crop" | "fit";

/**
 * Per-output photo framing for the website outputs. The photo itself is
 * shared (Project.photo.source); only how it is placed differs.
 *   crop: fill the frame, cropping around the focal point (zoom allowed).
 *   fit:  show the whole photo at its own proportions; the empty sides are
 *         filled with a soft extension of the photo's outer edge.
 *   auto: crop when that keeps most of the photo, otherwise fit.
 */
export interface WebFraming {
  fill: PhotoFill;
  /** Crop: focal point. Fit: where the photo sits in the free space. 0–100. */
  focusX: number;
  focusY: number;
  /** Crop only. 1 = just fills the frame; up to 2.5. */
  zoom: number;
}
