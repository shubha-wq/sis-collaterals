import { useEffect, useMemo, useState } from "react";
import { color } from "@/design-system/tokens";
import { planWebPhoto } from "@/layout/webPhotoPlan";
import type { LandscapeNeed } from "@/expansion/landscape";
import { landscapePlacement } from "@/expansion/spec";
import type { WebFraming } from "@/model/outputs";
import type { ExpansionRecord } from "@/model/project";
import { SlotHint } from "../shared/Photo";
import type { ImageSlot } from "../types";
import { extensionFor } from "./extension";

interface WebPhotoProps {
  slot: ImageSlot;
  framing: WebFraming;
  width: number;
  height: number;
  emptyGround: string;
  hint?: string;
  /** Whether the whole-photo framing needs the AI landscape, and its state. */
  landscape?: LandscapeNeed;
  /** The stored landscape (project.photo.expansion) and its file. */
  record?: ExpansionRecord;
  landscapeUrl?: string;
  /** Editor-only text while the landscape is being generated, e.g. "Generating Website Banner…". */
  generatingHint?: string;
}

/**
 * The photo layer for the website outputs. The original photo is drawn
 * once, untouched, at its own aspect ratio (planWebPhoto never distorts):
 * covering the frame (crop), or whole (fit). Behind a whole photo:
 *   - the AI-generated landscape, positioned so its copy of the photo sits
 *     exactly under the original (which is drawn on top, so generated
 *     pixels can only ever show outside the photo);
 *   - only if AI expansion isn't configured: the soft edge-fill fallback;
 *   - while generating or after a failure: plain ground (Download is
 *     blocked by the review until the landscape is ready).
 */
export function WebPhoto({ slot, framing, width, height, emptyGround, hint, landscape, record, landscapeUrl, generatingHint }: WebPhotoProps) {
  const image = slot.state === "ready" ? slot.image : null;
  const { fill, focusX, focusY, zoom } = framing;
  const plan = useMemo(
    () => (image ? planWebPhoto(image.width, image.height, width, height, { fill, focusX, focusY, zoom }) : null),
    [image, width, height, fill, focusX, focusY, zoom],
  );
  const [ext, setExt] = useState<{ key: string; url: string } | null>(null);
  const needed = landscape?.kind === "needed" ? landscape : null;
  const useAi = !!needed && needed.ready && !!record && !!landscapeUrl;
  // The soft edge fill is the emergency fallback only: when no AI provider is configured.
  const useFallback = !!needed && !useAi && needed.status.state === "unavailable";
  const extKey = useFallback && image && plan && plan.gaps.length ? `${image.url}|${width}|${height}|${plan.photo.x}|${plan.photo.y}|${plan.photo.w}|${plan.photo.h}` : null;

  useEffect(() => {
    if (!image || !plan || !extKey) return;
    let live = true;
    extensionFor(image.url, image.width, image.height, plan, width, height)
      .then((url) => live && setExt((cur) => (cur?.key === extKey && cur.url === url ? cur : { key: extKey, url })))
      .catch(() => live && setExt({ key: extKey, url: "" }));
    return () => {
      live = false;
    };
    // The key captures everything the extension depends on.
  }, [extKey]);

  const extUrl = extKey && ext?.key === extKey ? ext.url : null;
  const pending = !!extKey && extUrl === null;
  const r = plan?.photo;
  const place = useAi && r ? landscapePlacement(record!, r) : null;
  const waiting = !!needed && !useAi && !useFallback;
  return (
    <div
      data-slot="photo-fill"
      data-layer="photo"
      data-fill={plan?.mode}
      data-pending={pending ? "true" : undefined}
      data-landscape={needed ? (useAi ? "ai" : useFallback ? "fallback" : needed.status.state) : undefined}
      data-photo-rect={r ? [r.x, r.y, r.w, r.h].map((n) => Math.round(n * 100) / 100).join(",") : undefined}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: image ? color("ink") : emptyGround }}
    >
      {place && (
        <img
          data-slot="photo-landscape"
          data-key={record!.key}
          src={landscapeUrl}
          alt=""
          draggable={false}
          style={{ position: "absolute", left: place.x, top: place.y, width: place.w, height: place.h, maxWidth: "none", display: "block" }}
        />
      )}
      {extUrl && <img data-slot="photo-extension" src={extUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />}
      {image && r && (
        <img
          data-slot="photo-image"
          src={image.url}
          alt=""
          draggable={false}
          style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, maxWidth: "none", display: "block" }}
        />
      )}
      {waiting && generatingHint && (
        <SlotHint text={needed!.status.state === "failed" ? "Landscape failed — try again under Photo" : generatingHint} strong={needed!.status.state === "failed"} />
      )}
      {slot.state === "missing" && <SlotHint text={`Photo missing — re-upload ${slot.name}`} strong />}
      {slot.state === "empty" && hint && <SlotHint text={hint} />}
    </div>
  );
}
