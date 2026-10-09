import { findBuiltinLogo, findBuiltinPhoto } from "@/assets/catalog";
import { SIS_DRAWABLE } from "@/assets/useTemplateImages";
import { createBlankProject } from "@/model/blank";
import type { WebFraming, WebOutputId } from "@/model/outputs";
import type { ImageSource } from "@/model/assets";
import { expansionKey, expansionSpec } from "@/expansion/spec";
import type { EventContent, ExpansionRecord, LogoBackground, Overrides, Project, StyleSettings, TemplateId, TextColourChoice, TextRole } from "@/model/project";
import type { DrawableImage, ImageSlot, TemplateImages } from "@/templates/types";

/**
 * Developer-only QA fixtures for the /qa/templates matrix (every template). Not reachable in
 * production (the QA route is off) and never used by the editor.
 */

const svg = (w: number, h: number, body: string): DrawableImage => ({
  url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`),
  width: w,
  height: h,
});

/** Test logos: shapes that stress the logo row. All transparent. */
export const QA_LOGOS = {
  wide: svg(1200, 240, `<rect x="0" y="40" width="1200" height="160" rx="80" fill="#1D4E9B"/><text x="600" y="150" font-family="Arial" font-weight="700" font-size="110" text-anchor="middle" fill="#fff">AUKERA</text>`),
  square: svg(400, 400, `<circle cx="200" cy="200" r="190" fill="#17BEBB"/><text x="200" y="235" font-family="Arial" font-weight="700" font-size="100" text-anchor="middle" fill="#110405">DH</text>`),
  tall: svg(240, 720, `<rect x="20" y="0" width="200" height="720" rx="30" fill="#EDBB1F"/><text x="120" y="380" font-family="Arial" font-weight="700" font-size="70" text-anchor="middle" fill="#110405">M</text>`),
  white: svg(900, 300, `<text x="450" y="200" font-family="Arial" font-weight="700" font-size="170" text-anchor="middle" fill="#ffffff">MILLE</text>`),
  extraWide: svg(3000, 200, `<rect x="0" y="20" width="3000" height="160" fill="#110405"/><text x="1500" y="135" font-family="Arial" font-size="110" text-anchor="middle" fill="#fff">VERY WIDE PARTNER WORDMARK</text>`),
} as const;

/** Synthetic photos for awkward aspect ratios and tiny sizes. */
const QA_PHOTOS = {
  panorama: svg(3200, 800, `<defs><linearGradient id="g"><stop offset="0" stop-color="#17BEBB"/><stop offset="1" stop-color="#1D4E9B"/></linearGradient></defs><rect width="3200" height="800" fill="url(#g)"/><circle cx="1600" cy="400" r="260" fill="#EF6033"/>`),
  tiny: svg(200, 150, `<rect width="200" height="150" fill="#B8AFA3"/><circle cx="100" cy="75" r="40" fill="#EF6033"/>`),
  tower: svg(500, 2400, `<rect width="500" height="2400" fill="#3A2E2C"/><rect x="100" y="900" width="300" height="600" fill="#FFD33B"/>`),
  // Website shapes: a "subject" (circle + body) near each edge, so a bad crop is visible.
  square: svg(1200, 1200, `<rect width="1200" height="1200" fill="#7FA77A"/><rect y="800" width="1200" height="400" fill="#5C5049"/><circle cx="170" cy="420" r="90" fill="#EF6033"/><rect x="110" y="510" width="120" height="300" fill="#EF6033"/><circle cx="1030" cy="420" r="90" fill="#1D4E9B"/><rect x="970" y="510" width="120" height="300" fill="#1D4E9B"/>`),
  landscape32: svg(1800, 1200, `<rect width="1800" height="1200" fill="#9DB6C9"/><rect y="820" width="1800" height="380" fill="#6B5D52"/><circle cx="900" cy="430" r="110" fill="#EF6033"/><rect x="830" y="540" width="140" height="300" fill="#EF6033"/>`),
  classic43: svg(1600, 1200, `<rect width="1600" height="1200" fill="#C9B79D"/><rect y="860" width="1600" height="340" fill="#4A3F38"/><circle cx="520" cy="440" r="110" fill="#17BEBB"/><rect x="450" y="550" width="140" height="320" fill="#17BEBB"/>`),
  wide169: svg(1920, 1080, `<rect width="1920" height="1080" fill="#B7C99D"/><circle cx="960" cy="420" r="120" fill="#EF6033"/>`),
};

const ready = (image: DrawableImage): ImageSlot => ({ state: "ready", image });
const builtinPhoto = (id: string): ImageSlot => {
  const p = findBuiltinPhoto(id)!;
  return ready({ url: p.url, width: p.width, height: p.height });
};
const nike = (): ImageSlot => {
  const l = findBuiltinLogo("nike")!;
  return ready({ url: l.url, width: l.width, height: l.height });
};

const FULL: Partial<EventContent> = {
  headline: "Padel\nCoaching\nWorkshop",
  date: "10th October",
  day: "Saturday",
  time: "4:00–7:00 PM",
  venue: "Hive Club",
  city: "Bangalore",
};

export interface TemplateFixture {
  id: string;
  label: string;
  project: Project;
  images: TemplateImages;
  /** Expected partner logos rendered. */
  partners: number;
  /** True when "cannot fit" is an acceptable outcome (absurd content). */
  expectCannotFit?: boolean;
  /** True when "cannot fit" is the only correct outcome. */
  mustNotFit?: boolean;
  /** Text blocks expected to read as low contrast (advisory warning). */
  expectLowContrast?: TextRole[];
}

interface Spec {
  id: string;
  label: string;
  content?: Partial<EventContent>;
  photo?: ImageSlot;
  logos?: ImageSlot[];
  background?: LogoBackground;
  style?: Partial<StyleSettings>;
  overrides?: Overrides;
  expectCannotFit?: boolean;
  mustNotFit?: boolean;
  textColours?: Partial<Record<TextRole, TextColourChoice>>;
  expectLowContrast?: TextRole[];
}

const SPECS: Spec[] = [
  { id: "blank", label: "Completely blank" },
  { id: "photo-only", label: "Photo only", photo: builtinPhoto("basketball-jakkur") },
  { id: "headline-only", label: "Headline only", content: { headline: "Run Club" } },
  { id: "details-only", label: "Details only", content: { date: "10th October", day: "Saturday", time: "4:00–7:00 PM", venue: "Hive Club" } },
  { id: "headline-photo", label: "Headline + photo", content: { headline: "Run Club" }, photo: builtinPhoto("run-cubbon-park") },
  { id: "minimal", label: "Minimal (headline + date)", content: { headline: "Yoga", date: "21st September" }, photo: builtinPhoto("yoga-cubbon-park") },
  { id: "normal", label: "Normal content", content: FULL, photo: builtinPhoto("padel-hive-club"), logos: [nike()] },
  {
    id: "long-headline", label: "Very long headline (typed breaks)",
    content: { ...FULL, headline: "Sisters and Misters\nBasketball Game Night\nfor Absolute Beginners" },
    photo: builtinPhoto("basketball-st-josephs"),
  },
  {
    id: "long-headline-natural", label: "Very long headline (no breaks)",
    content: { ...FULL, headline: "Sisters and Misters Basketball Game Night for Absolute Beginners" },
    photo: builtinPhoto("basketball-st-josephs"),
  },
  {
    id: "long-word", label: "Single very long word",
    content: { ...FULL, headline: "Supercalifragilisticexpialidocious" },
    photo: builtinPhoto("basketball-jakkur"),
  },
  {
    id: "long-venue", label: "Long venue",
    content: { ...FULL, venue: "St. Joseph's University Indoor Basketball Court, Langford Road, Shanthala Nagar" },
    photo: builtinPhoto("basketball-indoor-court"),
  },
  { id: "long-time", label: "Long time", content: { ...FULL, time: "6:45 AM – 8:15 AM, then brunch until 10:30 AM" }, photo: builtinPhoto("run-cubbon-park") },
  { id: "long-date", label: "Long date", content: { ...FULL, date: "Saturday 27th September to Sunday 28th September", day: "" }, photo: builtinPhoto("badminton-hsr") },
  { id: "logos-0", label: "0 partner logos", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [] },
  { id: "logos-1", label: "1 partner logo", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [nike()] },
  { id: "logos-2", label: "2 partner logos", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [nike(), ready(QA_LOGOS.wide)] },
  { id: "logos-3", label: "3 partner logos", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [nike(), ready(QA_LOGOS.wide), ready(QA_LOGOS.square)] },
  { id: "logos-4", label: "4 partner logos", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [nike(), ready(QA_LOGOS.wide), ready(QA_LOGOS.square), ready(QA_LOGOS.tall)] },
  { id: "logos-4-extreme", label: "4 logos incl. extra-wide", content: FULL, photo: builtinPhoto("football-bullring"), logos: [ready(QA_LOGOS.extraWide), ready(QA_LOGOS.wide), ready(QA_LOGOS.square), nike()] },
  { id: "logos-white", label: "White logo, no plate", content: FULL, photo: builtinPhoto("pilates-koramangala"), logos: [ready(QA_LOGOS.white)] },
  { id: "plate-paper", label: "Logo plates: Paper", content: FULL, photo: builtinPhoto("football-sm-game-day-sufc"), logos: [nike(), ready(QA_LOGOS.white)], background: "paper" },
  { id: "plate-white", label: "Logo plates: White", content: FULL, photo: builtinPhoto("football-sm-game-day-sufc"), logos: [nike(), ready(QA_LOGOS.wide)], background: "white" },
  { id: "plate-accent", label: "Logo plates: Accent", content: FULL, photo: builtinPhoto("football-sm-game-day-sufc"), logos: [nike(), ready(QA_LOGOS.white)], background: "accent" },
  { id: "no-photo", label: "No photo, full content, 1 logo", content: { ...FULL, subheader: "Run with Sisters in Sweat" }, logos: [nike()] },
  { id: "no-photo-0-logos", label: "No photo, 0 partner logos", content: FULL },
  { id: "no-photo-4-logos", label: "No photo, 4 partner logos", content: FULL, logos: [nike(), ready(QA_LOGOS.wide), ready(QA_LOGOS.square), ready(QA_LOGOS.tall)] },
  { id: "no-photo-long", label: "No photo, very long headline", content: { ...FULL, headline: "Sisters and Misters Basketball Game Night for Absolute Beginners" } },
  { id: "no-photo-blue", label: "No photo, royal blue", content: FULL, logos: [nike()], style: { accent: "royal-blue" } },
  { id: "photo-portrait-src", label: "Portrait source photo", content: FULL, photo: builtinPhoto("padel-hive-club") },
  { id: "photo-panorama", label: "Panorama photo (4:1)", content: FULL, photo: ready(QA_PHOTOS.panorama) },
  { id: "photo-tower", label: "Very tall photo (1:5)", content: FULL, photo: ready(QA_PHOTOS.tower) },
  { id: "photo-tiny", label: "Tiny photo (200 × 150)", content: FULL, photo: ready(QA_PHOTOS.tiny) },
  { id: "photo-low-res", label: "Low-res library photo", content: FULL, photo: builtinPhoto("run-cubbon-park-street") },
  {
    id: "everything", label: "Every field, long",
    content: {
      headline: "Specialised\nPilates Workshop",
      subheader: "SIS × The Pilates Studio, Chennai",
      date: "27th September", day: "Saturday", time: "10:00–11:30 AM",
      venue: "Pilates Academy, Koramangala 5th Block",
      city: "Bangalore",
      notes: "All levels welcome. Mats provided; bring water and a towel. ₹1,200 per person.",
    },
    photo: builtinPhoto("pilates-koramangala"), logos: [nike(), ready(QA_LOGOS.square)],
  },
  { id: "long-city", label: "Long city", content: { ...FULL, city: "Thiruvananthapuram and Kochi" }, photo: builtinPhoto("city-chennai"), logos: [nike(), ready(QA_LOGOS.wide)] },
  { id: "blue", label: "Royal blue accent", content: FULL, photo: builtinPhoto("acro-yoga-dhurii-domlur"), style: { accent: "royal-blue" } },
  { id: "yellow", label: "Golden yellow accent", content: FULL, photo: builtinPhoto("badminton-game-theory"), style: { accent: "golden-yellow" } },
  { id: "large-headline", label: "Headline: Large override", content: { ...FULL, headline: "Functional\nFitness" }, photo: builtinPhoto("functional-fitness-harrys"), overrides: { headlineSize: "large" } },
  { id: "missing-logo", label: "Missing logo file", content: FULL, photo: builtinPhoto("city-bangalore"), logos: [{ state: "missing", name: "Aukera" }, nike()] },
  {
    id: "absurd", label: "Absurd amount of text (expected: cannot fit)", expectCannotFit: true,
    content: {
      ...FULL,
      headline: "This headline is far too long\nfor any sensible creative\nand keeps going\nand going\nwell past reason\nwith even more words",
      subheader: "A subheader that is also much longer than any subheader should be",
      notes: "Notes that go on and on. ".repeat(8),
    },
    photo: builtinPhoto("run-cubbon-park"),
  },
  {
    id: "long-combo", label: "Long headline + long venue + long time + 4 logos",
    content: {
      ...FULL,
      headline: "Sisters and Misters Basketball Game Night for Absolute Beginners",
      venue: "St. Joseph's University Indoor Basketball Court, Langford Road, Shanthala Nagar",
      time: "6:45 AM – 8:15 AM, then brunch until 10:30 AM",
      subheader: "SIS × Double Dribble",
    },
    photo: builtinPhoto("basketball-indoor-court"), logos: [nike(), ready(QA_LOGOS.wide), ready(QA_LOGOS.square), ready(QA_LOGOS.tall)],
  },
  { id: "long-combo-no-photo", label: "Long combination, no photo", content: { ...FULL, headline: "Sisters and Misters Basketball Game Night for Absolute Beginners", venue: "St. Joseph's University Indoor Basketball Court, Langford Road", subheader: "SIS × Double Dribble", notes: "All levels welcome. Bring water." }, logos: [nike(), ready(QA_LOGOS.wide)] },
  { id: "ground-tint", label: "Background: Tint (Broadsheet)", content: FULL, photo: builtinPhoto("yoga-cubbon-park"), logos: [nike()], overrides: { paperGround: "tint" } },
  { id: "ground-colour", label: "Background: Colour (Broadsheet)", content: FULL, photo: builtinPhoto("yoga-cubbon-park"), logos: [nike()], overrides: { paperGround: "accent" } },
  { id: "slab-ink", label: "Slab colour: Ink", content: FULL, photo: builtinPhoto("football-jakkur"), logos: [nike()], overrides: { blockColour: "ink" } },
  { id: "slab-ink-no-photo", label: "Slab colour: Ink, no photo", content: FULL, overrides: { blockColour: "ink" } },
  // Event title fitting.
  { id: "title-short", label: "Title: short", content: { ...FULL, headline: "Run Club" }, photo: builtinPhoto("run-cubbon-park") },
  { id: "title-one-line", label: "Title: long name kept on one line if it can", content: { ...FULL, headline: "Saturday Morning Run" }, photo: builtinPhoto("run-cubbon-park"), logos: [nike()] },
  { id: "title-collab", label: "Title: Sisters in Sweat x Nike Badminton Social", content: { ...FULL, headline: "Sisters in Sweat x Nike Badminton Social" }, photo: builtinPhoto("badminton-hsr"), logos: [nike()] },
  { id: "title-ampersand", label: "Title: Strength & Conditioning", content: { ...FULL, headline: "Strength & Conditioning" }, photo: builtinPhoto("functional-fitness-harrys") },
  { id: "title-typed-break", label: "Title: typed line break", content: { ...FULL, headline: "Sweat Fest\n2026" }, photo: builtinPhoto("run-cubbon-park") },
  { id: "title-very-long", label: "Title: very long (wraps, balanced)", content: { ...FULL, headline: "Sisters in Sweat x Nike Run Club Saturday Morning Community Run and Breakfast Social" }, photo: builtinPhoto("run-cubbon-park"), logos: [nike()] },
  {
    id: "title-extreme", label: "Title: extremely long (fits its area or reports cannot fit)", expectCannotFit: true,
    content: { ...FULL, headline: "The Annual Sisters in Sweat Bangalore Community Fitness Festival with Running, Yoga, Pilates, Strength Training, Badminton, Football and Breakfast for Everyone" },
    photo: builtinPhoto("run-cubbon-park"),
  },
  // Independent text colours: different colours on different blocks.
  {
    id: "text-colours-mixed", label: "Text colours: every block different",
    content: { ...FULL, subheader: "Run with Sisters in Sweat", notes: "All levels welcome." }, photo: builtinPhoto("padel-hive-club"), logos: [nike()], background: "paper",
    textColours: { headline: "teal", subheader: "golden", date: "coral", day: "royal-blue", time: "golden", venue: "teal", "date-label": "royal-blue", "time-label": "ink", "venue-label": "coral", city: "off-white", notes: "golden" },
  },
  {
    id: "text-colours-no-photo", label: "Text colours: no photo, long venue",
    content: { ...FULL, venue: "St. Joseph's University Indoor Basketball Court, Langford Road" }, logos: [nike(), ready(QA_LOGOS.wide)],
    textColours: { headline: "royal-blue", venue: "ink", city: "golden" },
  },
  {
    id: "impossible", label: "Impossible amount of text (must report cannot fit)", expectCannotFit: true, mustNotFit: true,
    content: { ...FULL, headline: Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of headline`).join("\n"), notes: "Far too many notes. ".repeat(40) },
    photo: builtinPhoto("run-cubbon-park"),
  },
];

/** The headline in the colour of the ground it sits on (no photo), per template: must be flagged. */
const LOW_CONTRAST_HEADLINE: Record<TemplateId, TextColourChoice> = { block: "coral", broadsheet: "off-white", poster: "ink", slab: "coral", ticket: "off-white" };

export function templateFixtures(template: TemplateId, format: "feed" | "banner"): TemplateFixture[] {
  const specs: Spec[] = [
    ...SPECS,
    { id: "text-low-contrast", label: "Text colours: headline same as its ground (warns)", content: FULL, textColours: { headline: LOW_CONTRAST_HEADLINE[template] }, expectLowContrast: ["headline"] },
  ];
  return specs.map((s) => {
    const base = createBlankProject(`qa-${s.id}`, new Date("2026-10-06T00:00:00Z"), { template, format });
    const logos = s.logos ?? [];
    const project: Project = {
      ...base,
      content: { ...base.content, ...s.content },
      photo: { ...base.photo, source: s.photo ? { kind: "builtin", id: "qa" } : null },
      logos: { background: s.background ?? "none", partners: logos.map((_, i) => ({ id: `l${i}`, source: { kind: "builtin", id: `qa-${i}` } })) },
      style: { ...base.style, ...s.style, template, format },
      overrides: s.overrides ?? {},
      textColours: s.textColours,
    };
    return {
      id: s.id,
      label: s.label,
      project,
      partners: logos.length,
      expectCannotFit: s.expectCannotFit,
      mustNotFit: s.mustNotFit,
      expectLowContrast: s.expectLowContrast,
      images: { photo: s.photo ?? { state: "empty" }, sis: SIS_DRAWABLE, partners: logos.map((slot, i) => ({ id: `l${i}`, slot })) },
    };
  });
}

/**
 * Website Banner / Listing fixtures: the same content, logo and photo matrix
 * as the templates (so every combination is covered), plus photo shapes and
 * framings that exercise the crop / whole-photo rule.
 */
interface WebSpec extends Spec {
  framing?: Partial<WebFraming>;
  /** The AI landscape's state for this case (default: ready, with a QA stand-in image). */
  landscape?: "ready" | "pending" | "unavailable" | "failed";
}

const WEB_FULL: Partial<EventContent> = { headline: "Padel Coaching Workshop", date: "6th September", day: "Saturday", time: "10:00 AM – 11:30 AM", venue: "SS Sports, HSR Layout", city: "Bangalore" };

const WEB_SPECS: WebSpec[] = [
  { id: "web-photo-only", label: "Photo only", photo: builtinPhoto("football-jakkur") },
  { id: "web-photo-headline", label: "Photo + headline", content: { headline: "Run Club" }, photo: builtinPhoto("run-cubbon-park") },
  { id: "web-photo-details", label: "Photo + details (reference)", content: { date: "6th September", time: "10:00 AM – 11:30 AM", venue: "SS Sports, HSR" }, photo: builtinPhoto("badminton-hsr") },
  { id: "web-photo-logos", label: "Photo + logos", photo: builtinPhoto("football-jakkur"), logos: [nike(), ready(QA_LOGOS.wide)] },
  { id: "web-all", label: "Photo + headline + details + logos", content: WEB_FULL, photo: builtinPhoto("padel-hive-club"), logos: [nike()] },
  { id: "web-long-venue", label: "Long venue wraps", content: { ...WEB_FULL, venue: "St. Joseph's University Indoor Basketball Court, Langford Road, Shanthala Nagar" }, photo: builtinPhoto("basketball-indoor-court") },
  { id: "web-long-headline", label: "Long headline wraps", content: { ...WEB_FULL, headline: "Sisters and Misters Basketball Game Night for Absolute Beginners" }, photo: builtinPhoto("basketball-st-josephs"), logos: [nike(), ready(QA_LOGOS.wide), ready(QA_LOGOS.square), ready(QA_LOGOS.tall)] },
  { id: "web-square", label: "Square photo → whole photo", content: WEB_FULL, photo: ready(QA_PHOTOS.square) },
  { id: "web-32", label: "3:2 photo → crop", content: WEB_FULL, photo: ready(QA_PHOTOS.landscape32) },
  { id: "web-43", label: "4:3 photo → crop", content: WEB_FULL, photo: ready(QA_PHOTOS.classic43) },
  { id: "web-169", label: "16:9 photo → crop", content: WEB_FULL, photo: ready(QA_PHOTOS.wide169) },
  { id: "web-square-crop", label: "Square photo, Fill frame chosen", content: WEB_FULL, photo: ready(QA_PHOTOS.square), framing: { fill: "crop", focusY: 35 } },
  { id: "web-32-fit", label: "3:2 photo, Whole photo chosen", content: WEB_FULL, photo: ready(QA_PHOTOS.landscape32), framing: { fill: "fit" } },
  { id: "web-portrait-left", label: "Portrait photo positioned left", content: WEB_FULL, photo: builtinPhoto("padel-hive-club"), framing: { fill: "fit", focusX: 10 } },
  { id: "web-zoom", label: "Crop with zoom 1.8, focus top-left", content: WEB_FULL, photo: ready(QA_PHOTOS.classic43), framing: { fill: "crop", zoom: 1.8, focusX: 0, focusY: 0 } },
  {
    id: "web-text-colours", label: "Text colours: labels and values independent", content: { ...WEB_FULL, venue: "St. Joseph's University Indoor Basketball Court, Langford Road" }, photo: builtinPhoto("badminton-hsr"), logos: [nike()],
    textColours: { headline: "off-white", "date-label": "royal-blue", date: "off-white", day: "golden", "time-label": "off-white", time: "royal-blue", venue: "off-white", city: "golden" },
  },
  { id: "web-landscape-pending", label: "AI landscape still generating (download blocked)", content: WEB_FULL, photo: builtinPhoto("padel-hive-club"), landscape: "pending" },
  { id: "web-landscape-failed", label: "AI landscape failed (original kept, download blocked)", content: WEB_FULL, photo: builtinPhoto("padel-hive-club"), landscape: "failed" },
  { id: "web-landscape-unavailable", label: "AI not configured: soft edge fallback", content: WEB_FULL, photo: builtinPhoto("padel-hive-club"), landscape: "unavailable" },
  { id: "web-text-low-contrast", label: "Text colours: coral headline on the coral arc (warns)", content: WEB_FULL, photo: builtinPhoto("badminton-hsr"), textColours: { headline: "coral" }, expectLowContrast: ["headline"] },
];

export interface WebFixture extends TemplateFixture {
  output: WebOutputId;
  landscape: "ready" | "pending" | "unavailable" | "failed";
}

/**
 * A deterministic stand-in for an AI landscape (QA only; no network, no
 * AI): an SVG at the exact landscape size, plainly striped, with the photo's
 * slot marked. The renderer draws the original photo on top of it.
 */
function qaLandscape(source: ImageSource, photo: ImageSlot): { record: ExpansionRecord; slot: ImageSlot } | null {
  if (photo.state !== "ready") return null;
  const spec = expansionSpec(photo.image.width, photo.image.height, 1600, 1000);
  if (!spec) return null;
  const image = svg(
    spec.masterW,
    spec.masterH,
    `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#6B8F71"/><stop offset="1" stop-color="#3E5C76"/></linearGradient><pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="30" height="60" fill="#ffffff" opacity=".08"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#p)"/><rect x="${spec.photoX}" y="${spec.photoY}" width="${spec.photoW}" height="${spec.photoH}" fill="#FF00FF"/>`,
  );
  const record: ExpansionRecord = { key: expansionKey(source, spec), blobId: "0".repeat(64), masterW: spec.masterW, masterH: spec.masterH, photoX: spec.photoX, photoY: spec.photoY, photoW: spec.photoW, photoH: spec.photoH, provider: "qa", createdAt: "2026-10-06T00:00:00.000Z" };
  return { record, slot: { state: "ready", image } };
}

export function webFixtures(output: WebOutputId): WebFixture[] {
  const shared = SPECS.filter((s) => s.photo && !["impossible", "absurd", "everything", "no-photo"].includes(s.id) && !s.style && !s.overrides);
  const specs: WebSpec[] = [...WEB_SPECS, ...shared];
  if (output === "website-banner") {
    specs.push({ id: "web-impossible", label: "Impossible amount of text (must report cannot fit)", mustNotFit: true, expectCannotFit: true, content: { ...WEB_FULL, headline: Array.from({ length: 18 }, (_, i) => `Line ${i + 1} of the headline`).join("\n"), venue: "A very long venue name that goes on and on, ".repeat(4) }, photo: builtinPhoto("run-cubbon-park") });
  }
  return specs.map((s) => {
    const base = createBlankProject(`qa-${output}-${s.id}`, new Date("2026-10-06T00:00:00Z"), { output, format: "banner" });
    const logos = s.logos ?? [];
    const source: ImageSource = { kind: "builtin", id: "qa" };
    const land = s.photo && (s.landscape ?? "ready") === "ready" ? qaLandscape(source, s.photo) : null;
    const project: Project = {
      ...base,
      content: { ...base.content, ...s.content },
      photo: { ...base.photo, source: s.photo ? source : null, web: s.framing ? { [output]: s.framing } : undefined, ...(land ? { expansion: land.record } : {}) },
      logos: { background: s.background ?? "none", partners: logos.map((_, i) => ({ id: `l${i}`, source: { kind: "builtin", id: `qa-${i}` } })) },
      style: { ...base.style, output, format: "banner" },
      textColours: s.textColours,
    };
    return {
      id: s.id,
      label: s.label,
      output,
      project,
      partners: output === "website-listing" ? 0 : logos.length,
      expectCannotFit: s.expectCannotFit,
      mustNotFit: s.mustNotFit,
      // The Listing has no text, so nothing to warn about.
      expectLowContrast: output === "website-banner" ? s.expectLowContrast : undefined,
      landscape: s.landscape ?? "ready",
      images: {
        photo: s.photo ?? { state: "empty" },
        sis: SIS_DRAWABLE,
        partners: logos.map((slot, i) => ({ id: `l${i}`, slot })),
        landscape: land?.slot ?? { state: "empty" },
        expansionStatus:
          s.landscape === "unavailable" ? { state: "unavailable", message: "Not configured (QA)." } : s.landscape === "failed" ? { state: "failed", message: "Provider error (QA)." } : s.landscape === "pending" ? { state: "generating" } : undefined,
      },
    };
  });
}
