import { exportCreative } from "@/export/exportCreative";
import type { Project } from "@/model/project";
import type { TemplateImages } from "@/templates/types";

/**
 * A small JPEG preview for the library list, made with the real export
 * pipeline (so it shows exactly what downloads). Null when the creative
 * can't be exported right now; the save still goes ahead.
 */
export async function makeThumbnail(project: Project, images: TemplateImages, width = 480): Promise<Blob | null> {
  try {
    const { blob, width: w, height: h } = await exportCreative(project, images);
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round((h / w) * width);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}
