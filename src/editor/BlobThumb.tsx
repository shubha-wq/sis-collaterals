import { useEffect, useState } from "react";
import { resolveImage } from "@/assets/resolveImage";
import type { BlobStore } from "@/persistence/types";

/** Shows a stored file (thumbnail) as an image; releases its URL when unmounted. */
export function BlobThumb({ blobId, blobs, className, alt = "" }: { blobId: string; blobs: BlobStore; className?: string; alt?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    let release = () => {};
    void resolveImage({ kind: "upload", blobId, name: "" }, blobs).then((r) => {
      if (r.status !== "ready") return;
      if (!live) return r.release();
      release = r.release;
      setUrl(r.url);
    });
    return () => {
      live = false;
      release();
    };
  }, [blobId, blobs]);
  return url ? <img src={url} alt={alt} className={className} /> : <span className={className} aria-hidden="true" />;
}
