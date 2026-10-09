/**
 * How a project points at an image. Projects never hold image bytes; they
 * hold a reference, and the bytes live in a content-addressed blob store.
 *
 * Deleting a logo from the library removes only the library entry. A project
 * that used it keeps working because it references the blob by content hash
 * (`blobId`), and the blob store keeps any blob a saved project still uses.
 * If a blob is ever genuinely missing (site data cleared, partial import), the
 * renderer shows a "logo missing" state instead of failing.
 */

/** SHA-256 of the file contents, hex. Identical files share one stored blob. */
export type BlobId = string;

export type ImageSource =
  /** Shipped with the app (SIS roundel, Nike, library photos). */
  | { kind: "builtin"; id: string }
  /** Uploaded by this user. `libraryId` may no longer exist in the library. */
  | { kind: "upload"; blobId: BlobId; libraryId?: string; name: string };

/** File types accepted for logos. PDF is converted to PNG on upload. */
export type LogoFileType = "svg" | "png" | "jpeg" | "webp" | "gif" | "pdf";

export interface ImageMeta {
  /** Type of the stored display file (a PDF upload is stored as "png"). */
  fileType: Exclude<LogoFileType, "pdf">;
  /** Vector logos stay sharp at any size. */
  vector: boolean;
  width: number;
  height: number;
  bytes: number;
  /** True when every corner is opaque and near-white: a baked-in background. */
  looksOpaqueBackground: boolean;
}
