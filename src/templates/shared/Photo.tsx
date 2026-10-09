import type { PhotoSettings } from "@/model/project";
import type { ImageSlot } from "../types";

/**
 * Fills its (positioned) parent with the photo. object-fit: cover crops
 * without distortion; the focal point keeps the subject in frame and is also
 * the zoom origin, so zooming never pushes the subject out.
 */
export function Photo({ slot, settings, emptyGround, hint }: { slot: ImageSlot; settings: PhotoSettings; emptyGround: string; hint?: string }) {
  const pos = `${settings.focusX}% ${settings.focusY}%`;
  return (
    <div data-slot="photo-fill" data-layer="photo" style={{ position: "absolute", inset: 0, overflow: "hidden", background: emptyGround, borderRadius: "inherit" }}>
      {slot.state === "ready" && (
        <img
          src={slot.image.url}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: pos,
            transform: settings.zoom > 1 ? `scale(${settings.zoom})` : undefined,
            transformOrigin: pos,
            display: "block",
          }}
        />
      )}
      {slot.state === "missing" && <SlotHint text={`Photo missing — re-upload ${slot.name}`} strong />}
      {slot.state === "empty" && hint && <SlotHint text={hint} />}
    </div>
  );
}

/** Editor-only guidance inside an empty or broken slot. Never drawn in exports. */
export function SlotHint({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <div
      data-hint="true"
      data-layer="hint"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "calc(var(--u) * 40)",
        fontFamily: "var(--font-body)",
        fontWeight: "var(--fw-semibold)",
        fontSize: "calc(var(--u) * 26)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: strong ? "var(--coral-deep)" : "var(--stone)",
      }}
    >
      {text}
    </div>
  );
}
