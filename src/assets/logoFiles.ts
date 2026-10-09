import type { LogoFileType } from "@/model/assets";

/** Pure helpers for logo uploads. No DOM access, so they run in tests. */

/** Larger files are refused: logos this big are almost always a mistake. */
export const MAX_LOGO_BYTES = 25 * 1024 * 1024;

export const LOGO_ACCEPT = "image/svg+xml,image/png,image/jpeg,image/webp,image/gif,application/pdf,.svg,.png,.jpg,.jpeg,.webp,.gif,.pdf";

const BY_MIME: Record<string, LogoFileType> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const BY_EXT: Record<string, LogoFileType> = {
  svg: "svg", png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", gif: "gif", pdf: "pdf",
};

/** Browsers sometimes report an empty or generic MIME type, so the extension is a fallback. */
export function detectLogoType(fileName: string, mimeType: string): LogoFileType | null {
  const byMime = BY_MIME[mimeType.toLowerCase()];
  if (byMime) return byMime;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return BY_EXT[ext] ?? null;
}

const NOISE = new Set(["logo", "final", "copy", "v1", "v2", "v3", "new", "rgb", "cmyk", "print", "web", "transparent", "png", "svg"]);

/**
 * "dame-health_logo-FINAL@2x.png" → "Dame Health". Keeps the words people
 * would recognise; drops sizes, versions and filler. Falls back to "Logo".
 */
export function humanizeLogoName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/@\dx$/i, "");
  const words = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.()[\]]+/)
    .filter(Boolean)
    .filter((w) => !NOISE.has(w.toLowerCase()) && !/^\d+$/.test(w) && !/^\d+x\d+$/i.test(w));
  const name = words.map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");
  return name.slice(0, 60) || "Logo";
}

/** Intrinsic size of an SVG from width/height or viewBox. Null when it has neither. */
export function parseSvgSize(svgText: string): { width: number; height: number } | null {
  const tag = svgText.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const px = (v?: string) => {
    if (!v || /%$/.test(v.trim())) return NaN;
    return parseFloat(v);
  };
  const w = px(attr("width"));
  const h = px(attr("height"));
  const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const vw = vb && vb.length === 4 ? vb[2]! : NaN;
  const vh = vb && vb.length === 4 ? vb[3]! : NaN;
  if (w > 0 && h > 0) return { width: w, height: h };
  if (vw > 0 && vh > 0) {
    if (w > 0) return { width: w, height: (w * vh) / vw };
    if (h > 0) return { width: (h * vw) / vh, height: h };
    return { width: vw, height: vh };
  }
  return null;
}

/**
 * True when every sampled corner pixel is opaque and near-white, which means
 * the logo has a baked-in background. `corners` holds RGBA tuples.
 */
export function cornersLookOpaque(corners: ReadonlyArray<readonly [number, number, number, number]>): boolean {
  if (!corners.length) return false;
  return corners.every(([r, g, b, a]) => a > 250 && r > 225 && g > 225 && b > 225);
}
