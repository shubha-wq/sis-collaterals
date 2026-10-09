import { color } from "@/design-system/tokens";
import type { FitStep } from "@/layout/types";
import { webFraming } from "@/model/webFraming";
import { landscapeNeed } from "@/expansion/landscape";
import { TemplateCanvas, useTemplateEnv } from "../shared/kit";
import type { TemplateProps } from "../types";
import { useLandscape } from "./landscape";
import { WebPhoto } from "./WebPhoto";

/**
 * WEBSITE LISTING · 1600 × 1000. The photo, and nothing else: no text, no
 * arc, no logos. Never uses the Instagram templates. The photo is cropped
 * when that is safe, otherwise shown whole over a soft edge extension.
 */
const LISTING_LADDER: readonly FitStep[] = [{ spacing: 1, headline: 1 }];

export function WebsiteListing(props: TemplateProps) {
  const project = useLandscape(props.project);
  const env = useTemplateEnv({ ...props, project });
  const { width, height } = env.format;
  const framing = webFraming(project, "website-listing", env.images.photo.state === "ready" ? env.images.photo.image : null);
  return (
    <TemplateCanvas env={env} template="website-listing" ladder={LISTING_LADDER} background={color("ink")} onFit={props.onFit}>
      <WebPhoto slot={env.images.photo} framing={framing} landscape={landscapeNeed(project, env.images, framing, width, height)} record={project.photo.expansion} landscapeUrl={env.images.landscape?.state === "ready" ? env.images.landscape.image.url : undefined} generatingHint={env.mode === "editor" ? "Generating Website Listing…" : undefined} width={width} height={height} emptyGround={color("paper-warm")} hint={env.mode === "editor" ? "+ Add a photo" : undefined} />
    </TemplateCanvas>
  );
}
