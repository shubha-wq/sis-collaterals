import type { BlobId, ImageSource } from "./assets";
import type { FormatId } from "./formats";
import type { OutputId, WebFraming, WebOutputId } from "./outputs";

/**
 * The content model. Everything a person types or picks lives here; nothing
 * about how it is drawn. Templates read this and decide layout themselves.
 */

export type TemplateId = "broadsheet" | "poster" | "block" | "slab" | "ticket";
export type DetailStyle = "rows" | "tags" | "ledger" | "cards" | "inline";
export type AccentId = "coral" | "teal" | "royal-blue" | "golden-yellow" | "salmon";
export type LogoBackground = "none" | "paper" | "white" | "accent";
export type HeadlineSize = "auto" | "small" | "large";
export type TextColour = "auto" | "ink" | "off-white" | "coral" | "teal" | "royal-blue" | "golden";
/** Broadsheet ground. Replaces the old raw `broadsheetGround` control. */
export type PaperGround = "paper" | "tint" | "accent";
/** Slab block colour. Replaces the old raw `slabGround` control. */
export type BlockColour = "accent" | "ink";

export interface EventContent {
  headline: string;
  subheader: string;
  /** Free text, written the way people say a date (day and month). */
  date: string;
  day: string;
  time: string;
  venue: string;
  city: string;
  notes: string;
}

export interface PhotoSettings {
  /** null = no photo yet. A blank creative has none. */
  source: ImageSource | null;
  /** Focal point, 0–100 on each axis. Auto-crop keeps it in frame. */
  focusX: number;
  focusY: number;
  /** 1 = cover; up to 2.5. */
  zoom: number;
  /**
   * Framing for the website outputs, per output: only what the person
   * changed (see webFraming for the defaults). Cleared whenever the photo changes.
   */
  web?: Partial<Record<WebOutputId, Partial<WebFraming>>>;
  /**
   * The AI-expanded landscape made from this photo for the website outputs
   * (a separate derived file; the photo itself is never changed). Shared by
   * Website Banner and Listing. Cleared whenever the photo changes.
   */
  expansion?: ExpansionRecord;
}

/** A generated landscape derivative of the source photo. */
export interface ExpansionRecord {
  /** expansionKey(): source + expansion geometry + version. */
  key: string;
  /** The generated landscape file (content hash), stored like any upload. */
  blobId: BlobId;
  masterW: number;
  masterH: number;
  /** Where the original photo sits inside the landscape. */
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  provider: string;
  createdAt: string;
}

export interface PartnerLogo {
  /** Stable within the project, so overrides survive reordering. */
  id: string;
  source: ImageSource;
}

/** Partner logos per creative, in addition to the SIS logo (old tool: 1 + 3 more). */
export const MAX_PARTNER_LOGOS = 4;

export interface LogoSettings {
  /** The SIS roundel is always rendered; it is not part of this list. */
  partners: PartnerLogo[];
  background: LogoBackground;
}

export interface StyleSettings {
  /** Instagram Creative, Website Banner or Website Listing. */
  output: OutputId;
  /** Instagram only. */
  template: TemplateId;
  format: FormatId;
  accent: AccentId;
  detailStyle: DetailStyle | "auto";
}

/**
 * Manual overrides. Every field is optional: absent means Auto.
 * "Reset to Auto" clears this object; it never touches content.
 */
export interface Overrides {
  headlineSize?: HeadlineSize;
  textColour?: TextColour;
  paperGround?: PaperGround;
  blockColour?: BlockColour;
  /** Multiplier on the auto logo size, 0.6–1.6. */
  logoScale?: number;
  showMarginGuide?: boolean;
}

/**
 * Semantic text blocks a creative can render. Each can have its own colour
 * (Project.textColours); absent means the template's own colour.
 */
export type TextRole =
  | "headline"
  | "subheader"
  | "date"
  | "day"
  | "time"
  | "venue"
  | "date-label"
  | "time-label"
  | "venue-label"
  | "city"
  | "notes";

/** An explicit colour for one text block, from the approved text palette. */
export type TextColourChoice = Exclude<TextColour, "auto">;

/**
 * Where this creative sits in the shared Creative Library: the version it
 * was last saved as (or opened from). Absent for a creative that has never
 * been saved to the library. Not stored inside library records themselves.
 */
export interface LibraryLink {
  version: number;
  savedAt: string;
}

export interface Project {
  /** Bumped whenever the shape changes; model/migrate.ts upgrades older versions on read. */
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  /** Draft name. Empty until the person names it; see displayName(). */
  name: string;
  createdAt: string;
  updatedAt: string;
  content: EventContent;
  photo: PhotoSettings;
  logos: LogoSettings;
  style: StyleSettings;
  overrides: Overrides;
  /** Per-block text colours. A missing key is Auto. */
  textColours?: Partial<Record<TextRole, TextColourChoice>>;
  library?: LibraryLink;
}

/** See model/migrate.ts for the schema history and upgrade steps. */
export const SCHEMA_VERSION = 2 as const;
