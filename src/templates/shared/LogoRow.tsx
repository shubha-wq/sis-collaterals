import type { LogoBackground } from "@/model/project";
import { useCanvas } from "@/layout/canvas";
import { Frame } from "@/layout/Frame";
import { logoRowScale, opticalLogoBox } from "@/layout/logoSizing";
import type { DrawableImage, ImageSlot } from "../types";

interface LogoRowProps {
  sis: DrawableImage;
  partners: Array<{ id: string; slot: ImageSlot }>;
  /** CSS fill for plates, or null for none (the default: logos stay transparent). */
  plate: string | null;
  background: LogoBackground;
  /** Side of a square logo in canvas units before count scaling. */
  base: number;
  scale?: number;
  align?: "start" | "end";
}

/**
 * Partners then SIS, as one auto-layout row that wraps when it must. Every
 * logo is sized optically (equal visual weight), keeps its aspect ratio and
 * transparency, and only gets a plate when the person picks one.
 */
export function LogoRow({ sis, partners, plate, background, base, scale = 1, align = "end" }: LogoRowProps) {
  const { u } = useCanvas();
  const size = base * logoRowScale(partners.length) * scale;
  const pad = plate ? { y: 12, x: 16 } : undefined;
  return (
    <Frame direction="row" wrap gap={26} rowGap={16} align="center" distribute={align === "end" ? "end" : "start"} fixedSpacing data-slot="logos" style={{ maxWidth: "100%" }} data-logo-background={background}>
      {partners.map((p) => (
        <Mark key={p.id} slot={p.slot} size={size} u={u} plate={plate} pad={pad} label="Partner logo" testId={`partner-${p.id}`} />
      ))}
      <Mark slot={{ state: "ready", image: sis }} size={size} u={u} plate={plate} pad={pad} label="Sisters in Sweat" testId="sis" />
    </Frame>
  );
}

function Mark({ slot, size, u, plate, pad, label, testId }: { slot: ImageSlot; size: number; u: number; plate: string | null; pad?: { x: number; y: number }; label: string; testId: string }) {
  const natural = slot.state === "ready" ? slot.image : { width: 1, height: 1 };
  const box = opticalLogoBox(natural.width, natural.height, { base: size });
  const frame = {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: plate ?? "transparent",
    borderRadius: plate ? "var(--r-subtle)" : 0,
    padding: pad ? `${Math.round(pad.y * u)}px ${Math.round(pad.x * u)}px` : 0,
  } as const;
  if (slot.state === "ready") {
    return (
      <div style={frame} data-slot="logo" data-logo={testId}>
        <img src={slot.image.url} alt={label} draggable={false} style={{ display: "block", width: box.width * u, height: box.height * u, objectFit: "contain" }} />
      </div>
    );
  }
  // Loading keeps the slot's footprint so the row doesn't jump; missing shows why.
  return (
    <div style={frame} data-slot="logo" data-logo={testId} data-state={slot.state}>
      <div
        data-hint={slot.state === "missing" ? "true" : undefined}
        style={{
          width: size * u,
          height: size * 0.6 * u,
          border: slot.state === "missing" ? `${Math.max(1, Math.round(2 * u))}px dashed var(--coral-deep)` : "none",
          color: "var(--coral-deep)",
          fontFamily: "var(--font-body)",
          fontWeight: "var(--fw-bold)",
          fontSize: 14 * u,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "rgba(250,240,228,.85)",
          visibility: slot.state === "missing" ? "visible" : "hidden",
        }}
      >
        Logo missing
      </div>
    </div>
  );
}
