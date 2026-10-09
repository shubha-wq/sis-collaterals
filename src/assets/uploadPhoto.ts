export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoUploadError";
  }
}

/** Throws a readable PhotoUploadError for files that can't be a photo. */
export function validatePhotoFile(file: File): void {
  const okType = /^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!okType) throw new PhotoUploadError("Choose a JPEG, PNG or WebP photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoUploadError("That photo is over 40 MB. Export a smaller JPEG.");
}

/** "IMG_2041 final.jpg" → "IMG_2041 final". */
export function photoName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "Photo";
}
