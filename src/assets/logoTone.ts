/**
 * A logo's overall tone, from its opaque pixels. Used only to warn when a
 * logo would disappear on its background; the logo is never altered and no
 * plate is ever added automatically.
 */
export type LogoTone = "dark" | "light" | "mixed";

/** Mostly-dark or mostly-light opaque pixels; anything else is mixed. */
export function classifyTone(rgba: ArrayLike<number>): LogoTone {
  let dark = 0;
  let light = 0;
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const l = (0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255;
    total += 1;
    if (l < 0.25) dark += 1;
    else if (l > 0.85) light += 1;
  }
  if (total === 0) return "mixed";
  if (dark / total > 0.8) return "dark";
  if (light / total > 0.8) return "light";
  return "mixed";
}

/** Browser: draw the logo small and classify it. Never throws. */
export async function measureTone(url: string): Promise<LogoTone> {
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    const c = document.createElement("canvas");
    const k = Math.min(1, 96 / Math.max(img.naturalWidth || 96, img.naturalHeight || 96));
    c.width = Math.max(1, Math.round((img.naturalWidth || 96) * k));
    c.height = Math.max(1, Math.round((img.naturalHeight || 96) * k));
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return "mixed";
    g.drawImage(img, 0, 0, c.width, c.height);
    return classifyTone(g.getImageData(0, 0, c.width, c.height).data);
  } catch {
    return "mixed";
  }
}
