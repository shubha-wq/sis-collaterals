import type { PhotoProcessor } from "@/persistence/types";
import { PhotoUploadError, photoName } from "./uploadPhoto";

const THUMB = 240;

/** Reads the photo's size and makes a small JPEG thumbnail for the picker. The original is never changed. */
export const browserPhotoProcessor: PhotoProcessor = {
  async process(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new PhotoUploadError("That file couldn't be opened as a photo."));
        i.src = url;
      });
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (!width || !height) throw new PhotoUploadError("That file couldn't be opened as a photo.");
      // Square-cropped thumbnail, like the picker shows it.
      const side = Math.min(width, height);
      const c = document.createElement("canvas");
      c.width = c.height = THUMB;
      c.getContext("2d")!.drawImage(img, (width - side) / 2, (height - side) / 2, side, side, 0, 0, THUMB, THUMB);
      const thumbnail = await new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new PhotoUploadError("Couldn't read that photo."))), "image/jpeg", 0.82),
      );
      return { name: photoName(file.name), thumbnail, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
