import type { ImageMeta } from "@/model/assets";
import type { Issue } from "./types";

/** Below this longest side, a raster logo can look soft when enlarged. */
export const SMALL_LOGO_PX = 400;
/** Wider or taller than this ratio reads as a strip; it still works, but sizes differently. */
export const EXTREME_ASPECT = 6;

/**
 * Advice about an uploaded logo. Never blocking, and never acted on
 * automatically: the file is always kept exactly as uploaded.
 */
export function assessLogo(meta: ImageMeta, name: string): Issue[] {
  const issues: Issue[] = [];
  if (meta.looksOpaqueBackground) {
    issues.push({
      id: "logo-background",
      level: "warning",
      message: `${name} appears to have a solid background. Upload a transparent PNG or SVG for the cleanest result.`,
    });
  }
  if (!meta.vector && Math.max(meta.width, meta.height) < SMALL_LOGO_PX) {
    issues.push({
      id: "logo-small",
      level: "warning",
      message: `${name} is small (${meta.width} × ${meta.height}) and may look soft. A larger PNG or an SVG will be sharper.`,
    });
  }
  const ratio = meta.width / Math.max(meta.height, 1);
  if (ratio > EXTREME_ASPECT || ratio < 1 / EXTREME_ASPECT) {
    issues.push({
      id: "logo-aspect",
      level: "warning",
      message: `${name} is very ${ratio > 1 ? "wide" : "tall"}. It will be sized to sit evenly with the other logos, so it may look ${ratio > 1 ? "thin" : "narrow"}.`,
    });
  }
  return issues;
}
