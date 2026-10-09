import { resolveFill } from "@/layout/webPhotoPlan";
import { OUTPUTS, type WebFraming, type WebOutputId } from "./outputs";
import type { Project } from "./project";

/**
 * The website framing for an output: whatever the person set, over the
 * defaults. Defaults: Auto fill, the photo's own focal point; and on the
 * Banner, a whole (uncropped) photo sits at the left so the arc covers the
 * extended background rather than the photo. Pass the photo's size so the
 * default can depend on whether it is cropped or shown whole.
 */
export function webFraming(project: Project, output: WebOutputId, photo?: { width: number; height: number } | null): WebFraming {
  const set = project.photo.web?.[output] ?? {};
  const fill = set.fill ?? "auto";
  const { width, height } = OUTPUTS[output];
  const whole = !!photo && resolveFill({ fill }, photo.width, photo.height, width, height) === "fit";
  return {
    fill,
    focusX: set.focusX ?? (output === "website-banner" && whole ? 0 : project.photo.focusX),
    focusY: set.focusY ?? project.photo.focusY,
    zoom: set.zoom ?? 1,
  };
}
