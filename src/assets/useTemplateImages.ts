import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSource } from "@/model/assets";
import type { Project } from "@/model/project";
import type { BlobStore } from "@/persistence/types";
import type { DrawableImage, ImageSlot, TemplateImages } from "@/templates/types";
import { BUILTIN_LOGOS, SIS_LOGO_ID, findBuiltinLogo, findBuiltinPhoto } from "./catalog";
import { measureTone } from "./logoTone";
import { resolveImage } from "./resolveImage";

const SIS = BUILTIN_LOGOS.find((l) => l.id === SIS_LOGO_ID)!;
export const SIS_DRAWABLE: DrawableImage = { url: SIS.url, width: SIS.width, height: SIS.height };

const keyOf = (s: ImageSource) => (s.kind === "builtin" ? `b:${s.id}` : `u:${s.blobId}`);

function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = url;
  });
}

function builtinSlot(id: string): ImageSlot {
  const logo = findBuiltinLogo(id);
  if (logo) return { state: "ready", image: { url: logo.url, width: logo.width, height: logo.height, tone: logo.tone } };
  const p = findBuiltinPhoto(id);
  return p ? { state: "ready", image: { url: p.url, width: p.width, height: p.height } } : { state: "missing", name: id };
}

/**
 * Resolves every image a project references into drawable URLs with natural
 * sizes. Built-ins resolve instantly; uploads read from the blob store once
 * and stay cached while referenced. A reference that can't be found becomes
 * a "missing" slot, never an error.
 */
export function useTemplateImages(project: Project, blobs: BlobStore | null): TemplateImages {
  const expansion = project.photo.expansion;
  const uploads = useMemo(() => {
    // The generated website landscape is a stored file like an upload.
    const derived: ImageSource | null = expansion ? { kind: "upload", blobId: expansion.blobId, name: "Generated landscape" } : null;
    const list = [project.photo.source, ...project.logos.partners.map((p) => p.source), derived];
    return list.filter((s): s is Extract<ImageSource, { kind: "upload" }> => s?.kind === "upload");
  }, [project.photo.source, project.logos.partners, expansion]);

  const [slots, setSlots] = useState<Record<string, ImageSlot>>({});
  const cache = useRef(new Map<string, { release: () => void } | "pending">());

  useEffect(() => {
    if (!blobs) return;
    const wanted = new Set(uploads.map(keyOf));
    // Release files that are no longer on the creative.
    for (const [k, entry] of cache.current) {
      if (!wanted.has(k)) {
        if (entry !== "pending") entry.release();
        cache.current.delete(k);
      }
    }
    for (const s of uploads) {
      const k = keyOf(s);
      if (cache.current.has(k)) continue;
      cache.current.set(k, "pending");
      void resolveImage(s, blobs).then(async (res) => {
        if (cache.current.get(k) !== "pending") {
          if (res.status === "ready") res.release();
          return;
        }
        if (res.status === "missing") {
          cache.current.delete(k);
          setSlots((r) => ({ ...r, [k]: { state: "missing", name: s.name } }));
          return;
        }
        cache.current.set(k, { release: res.release });
        const size = await naturalSize(res.url);
        // Tone only matters for logos (photos are never checked against grounds).
        const isLogo = project.logos.partners.some((p) => p.source.kind === "upload" && p.source.blobId === s.blobId);
        const tone = isLogo ? await measureTone(res.url) : undefined;
        setSlots((r) => ({ ...r, [k]: { state: "ready", image: { url: res.url, ...size, tone } } }));
      });
    }
  }, [uploads, blobs, project.logos.partners]);

  // Release everything when the editor goes away.
  useEffect(() => {
    const c = cache.current;
    return () => {
      for (const entry of c.values()) if (entry !== "pending") entry.release();
      c.clear();
    };
  }, []);

  const slot = (s: ImageSource | null): ImageSlot => {
    if (!s) return { state: "empty" };
    if (s.kind === "builtin") return builtinSlot(s.id);
    return slots[keyOf(s)] ?? { state: "loading" };
  };
  return {
    photo: slot(project.photo.source),
    sis: SIS_DRAWABLE,
    partners: project.logos.partners.map((p) => ({ id: p.id, slot: slot(p.source) })),
    landscape: expansion ? slot({ kind: "upload", blobId: expansion.blobId, name: "Generated landscape" }) : { state: "empty" },
  };
}
