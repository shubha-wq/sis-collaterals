import type { FitResult } from "@/layout/types";
import { planWebPhoto } from "@/layout/webPhotoPlan";
import { OUTPUTS, isWebOutput, type WebOutputId } from "@/model/outputs";
import { webFraming } from "@/model/webFraming";
import { landscapeNeed } from "@/expansion/landscape";
import type { Project } from "@/model/project";
import { groundTone, logoGroundHex } from "@/templates/logoGround";
import type { TemplateImages } from "@/templates/types";
import type { Issue } from "./types";
import { MIN_TEXT_CONTRAST, type ContrastReading } from "@/templates/shared/contrast";
import { TEXT_ROLE_LABELS } from "@/templates/textRoles";

/** A photo whose short side is below this may look soft when filling the canvas. */
export const LOW_RES_PHOTO_PX = 1000;

/**
 * The review box. "blocking" stops export because the result would be
 * broken or empty; "warning" never does.
 */
export function reviewProject(project: Project, images: TemplateImages, fit: FitResult | null, contrast: readonly ContrastReading[] = []): Issue[] {
  const output = project.style.output ?? "instagram";
  const issues = isWebOutput(output) ? reviewWebProject(project, output, images, fit) : reviewInstagram(project, images, fit);
  return [...issues, ...contrastWarnings(project, contrast)];
}

/**
 * A chosen text colour that is hard to read on its actual ground. Advisory,
 * like the logo legibility warning: the colour is never changed for you.
 */
export function contrastWarnings(project: Project, contrast: readonly ContrastReading[]): Issue[] {
  return contrast
    .filter((c) => c.ratio < MIN_TEXT_CONTRAST && project.textColours?.[c.role])
    .map((c) => ({
      id: `contrast-${c.role}`,
      level: "warning" as const,
      message: `${TEXT_ROLE_LABELS[c.role]} may have low contrast against this background (${c.ratio.toFixed(1)}:1). Consider ${c.ground === "dark" ? "Paper" : "Ink"}, or Auto under Text colours.`,
    }));
}

function reviewInstagram(project: Project, images: TemplateImages, fit: FitResult | null): Issue[] {
  const issues: Issue[] = [];
  const c = project.content;
  const block = (id: string, message: string) => issues.push({ id, level: "blocking", message });
  const warn = (id: string, message: string) => issues.push({ id, level: "warning", message });

  if (!c.headline.trim()) block("headline", "Add an event title.");
  if (images.photo.state === "missing") block("photo-missing", "The photo is no longer in this browser. Upload it again.");
  images.partners.forEach((p, i) => {
    if (p.slot.state === "missing") block(`logo-missing-${p.id}`, `Partner logo ${i + 1} (${p.slot.name}) is no longer in this browser. Upload it again or remove it.`);
  });
  if (fit?.status === "cannot-fit") block("fit", "There's more text than fits, even at the smallest title size. Shorten the event title or details.");

  if (images.photo.state === "empty") warn("photo", "No photo yet.");
  if (images.photo.state === "ready") {
    const { width, height } = images.photo.image;
    if (Math.min(width, height) < LOW_RES_PHOTO_PX) warn("photo-low-res", `This photo is small (${width} × ${height}) and will be enlarged, so it may look soft.`);
  }
  // A logo the same tone as the solid ground behind it would disappear. Warn
  // and point at the logo background options; never add a plate automatically.
  if (project.logos.background === "none") {
    const ground = groundTone(logoGroundHex(project, images.photo.state === "empty"));
    images.partners.forEach((p, i) => {
      if (ground && p.slot.state === "ready" && p.slot.image.tone === ground) {
        const fix = ground === "dark" ? "Paper or White" : "Accent";
        warn(`logo-contrast-${p.id}`, `Partner logo ${i + 1} is ${ground} and may disappear on this ${ground} background. Choose ${fix} under Logos → Logo background.`);
      }
    });
  }
  if (!c.date.trim() && !c.day.trim()) warn("date", "No date yet.");
  if (!c.time.trim()) warn("time", "No time yet.");
  if (!c.venue.trim()) warn("venue", "No venue yet.");
  return issues;
}

/**
 * Website Banner and Listing: the photo is the creative, so it is required;
 * all text is optional (photo only is a valid banner). The Listing draws no
 * logos, so only the Banner checks them.
 */
function reviewWebProject(project: Project, output: WebOutputId, images: TemplateImages, fit: FitResult | null): Issue[] {
  const issues: Issue[] = [];
  const block = (id: string, message: string) => issues.push({ id, level: "blocking", message });
  const warn = (id: string, message: string) => issues.push({ id, level: "warning", message });
  const { width: W, height: H } = OUTPUTS[output];

  if (images.photo.state === "empty") block("photo-required", `Add a photo. The ${OUTPUTS[output].label} is built around it.`);
  if (images.photo.state === "missing") block("photo-missing", "The photo is no longer in this browser. Upload it again.");
  if (output === "website-banner") {
    images.partners.forEach((p, i) => {
      if (p.slot.state === "missing") block(`logo-missing-${p.id}`, `Partner logo ${i + 1} (${p.slot.name}) is no longer in this browser. Upload it again or remove it.`);
    });
    if (fit?.status === "cannot-fit") block("fit", "There's more text than fits in the banner arc, even at the smallest title size. Shorten the event title or details.");
  }
  if (images.photo.state === "ready") {
    const { width, height } = images.photo.image;
    const framing = webFraming(project, output, images.photo.image);
    const plan = planWebPhoto(width, height, W, H, framing);
    if (plan.scale > 1.5) warn("photo-low-res", `This photo is small (${width} × ${height}) for a ${W} × ${H} image and will be enlarged, so it may look soft.`);
    const need = landscapeNeed(project, images, framing, W, H);
    if (need.kind === "needed" && !need.ready) {
      const st = need.status;
      if (st.state === "unavailable") {
        warn("expansion-unavailable", "AI background expansion isn't set up, so the sides use a soft edge fill instead of generated background. An admin can set it up (docs/AI_IMAGE_EXPANSION.md), or choose Fill frame under Photo.");
      } else if (st.state === "failed") {
        block("expansion-failed", `The landscape image couldn't be generated. ${st.message} Use Try again under Photo, or choose Fill frame.`);
      } else {
        block("expansion-pending", "Generating landscape image… Download will be available when it's ready.");
      }
    }
  }
  return issues;
}

export function hasBlocking(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "blocking");
}
