import type { TemplateImages } from "@/templates/types";
import type { Issue } from "@/validation/types";

export interface ExportReadiness {
  ok: boolean;
  /** Plain-language reasons the download is unavailable right now. */
  reasons: string[];
}

/**
 * Whether the current creative can be downloaded. Only real layout or
 * rendering problems block it (blocking review issues, images still
 * loading). Advisory warnings, such as logo legibility, never do.
 */
export function exportReadiness(issues: Issue[], images: TemplateImages): ExportReadiness {
  const reasons = issues.filter((i) => i.level === "blocking").map((i) => i.message);
  const loading = images.photo.state === "loading" || images.partners.some((p) => p.slot.state === "loading");
  if (loading) reasons.push("Images are still loading. Try again in a moment.");
  return { ok: reasons.length === 0, reasons };
}
