import type { ImageSource } from "@/model/assets";
import { sourcesEqual } from "@/model/blank";
import type { OutputId, PhotoFill, WebOutputId } from "@/model/outputs";
import {
  MAX_PARTNER_LOGOS,
  type EventContent,
  type LogoBackground,
  type Overrides,
  type PartnerLogo,
  type Project,
  type ExpansionRecord,
  type StyleSettings,
  type TextColour,
  type TextRole,
} from "@/model/project";

/**
 * Every change a person can make to a creative, as data. `applyEdit` is pure
 * and synchronous, so the canvas reflects an edit in the same render.
 */
export type Edit =
  | { type: "content"; field: keyof EventContent; value: string }
  | { type: "photo"; source: ImageSource | null }
  | { type: "photo-framing"; focusX?: number; focusY?: number; zoom?: number }
  /** Website Banner / Listing framing. The photo itself stays shared. */
  | { type: "web-framing"; output: WebOutputId; fill?: PhotoFill; focusX?: number; focusY?: number; zoom?: number }
  | { type: "reset-web-framing"; output: WebOutputId }
  /** Records (or clears) the generated landscape for the current photo. */
  | { type: "photo-expansion"; expansion: ExpansionRecord | null }
  | { type: "output"; output: OutputId }
  | { type: "add-partner"; logo: PartnerLogo }
  | { type: "remove-partner"; id: string }
  /** Swaps the logo in one partner slot, keeping its position. */
  | { type: "replace-partner"; id: string; logo: PartnerLogo }
  | { type: "logo-background"; background: LogoBackground }
  | { type: "style"; style: Partial<StyleSettings> }
  | { type: "overrides"; overrides: Partial<Overrides> }
  /** One text block's colour; "auto" removes the override. */
  | { type: "text-colour"; role: TextRole; colour: TextColour }
  | { type: "reset-text-colours" }
  | { type: "reset-to-auto" }
  | { type: "rename"; name: string };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function applyEdit(p: Project, e: Edit): Project {
  switch (e.type) {
    case "content":
      return { ...p, content: { ...p.content, [e.field]: e.value } };
    case "photo":
      // A new photo starts centred; removing it clears the framing too. One
      // photo serves every output, so this also resets the website framings.
      return sourcesEqual(p.photo.source, e.source) ? p : { ...p, photo: { source: e.source, focusX: 50, focusY: 50, zoom: 1 } };
    case "photo-framing":
      return {
        ...p,
        photo: {
          ...p.photo,
          focusX: clamp(e.focusX ?? p.photo.focusX, 0, 100),
          focusY: clamp(e.focusY ?? p.photo.focusY, 0, 100),
          zoom: clamp(e.zoom ?? p.photo.zoom, 1, 2.5),
        },
      };
    case "web-framing": {
      // Store only what was changed, so the rest keeps following the defaults.
      const next = { ...p.photo.web?.[e.output] };
      if (e.fill !== undefined) next.fill = e.fill;
      if (e.focusX !== undefined) next.focusX = clamp(e.focusX, 0, 100);
      if (e.focusY !== undefined) next.focusY = clamp(e.focusY, 0, 100);
      if (e.zoom !== undefined) next.zoom = clamp(e.zoom, 1, 2.5);
      return { ...p, photo: { ...p.photo, web: { ...p.photo.web, [e.output]: next } } };
    }
    case "photo-expansion": {
      if (!p.photo.source) return p;
      const photo = { ...p.photo };
      if (e.expansion) photo.expansion = e.expansion;
      else delete photo.expansion;
      return { ...p, photo };
    }
    case "reset-web-framing": {
      if (!p.photo.web?.[e.output]) return p;
      const web = { ...p.photo.web };
      delete web[e.output];
      return { ...p, photo: { ...p.photo, web } };
    }
    case "output":
      // Switching output never touches content, photo or logos. Instagram is
      // always the 1080 × 1350 feed composition.
      if (p.style.output === e.output) return p;
      return { ...p, style: { ...p.style, output: e.output, ...(e.output === "instagram" ? { format: "feed" as const } : {}) } };
    case "add-partner": {
      const list = p.logos.partners;
      if (list.length >= MAX_PARTNER_LOGOS || list.some((l) => sourcesEqual(l.source, e.logo.source))) return p;
      return { ...p, logos: { ...p.logos, partners: [...list, e.logo] } };
    }
    case "replace-partner": {
      const list = p.logos.partners;
      const at = list.findIndex((l) => l.id === e.id);
      if (at < 0 || list.some((l, i) => i !== at && sourcesEqual(l.source, e.logo.source))) return p;
      return { ...p, logos: { ...p.logos, partners: list.map((l, i) => (i === at ? e.logo : l)) } };
    }
    case "remove-partner":
      return { ...p, logos: { ...p.logos, partners: p.logos.partners.filter((l) => l.id !== e.id) } };
    case "logo-background":
      return { ...p, logos: { ...p.logos, background: e.background } };
    case "style":
      return { ...p, style: { ...p.style, ...e.style } };
    case "overrides":
      return { ...p, overrides: { ...p.overrides, ...e.overrides } };
    case "text-colour": {
      const next = { ...p.textColours };
      if (e.colour === "auto") delete next[e.role];
      else next[e.role] = e.colour;
      return { ...p, textColours: next };
    }
    case "reset-text-colours":
      return { ...p, textColours: {} };
    case "reset-to-auto":
      // Manual adjustments only. Content, photo and logos are never touched.
      return { ...p, overrides: {}, textColours: {}, style: { ...p.style, detailStyle: "auto" }, photo: { ...p.photo, focusX: 50, focusY: 50, zoom: 1 } };
    case "rename":
      return { ...p, name: e.name.replace(/\s+/g, " ").trim().slice(0, 80) };
  }
}
