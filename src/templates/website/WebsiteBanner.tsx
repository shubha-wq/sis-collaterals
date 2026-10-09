import type { CSSProperties } from "react";
import { COLORS, color } from "@/design-system/tokens";
import { arcFor, insideArc } from "@/layout/arc";
import { Frame } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { webFraming } from "@/model/webFraming";
import { landscapeNeed } from "@/expansion/landscape";
import type { DetailItem } from "../shared/details";
import { DetailText } from "../shared/DetailStyles";
import type { TextPaint } from "../shared/paint";
import { Logos, TemplateCanvas, Title, makeLadder, useTemplateEnv, type TemplateEnv } from "../shared/kit";
import type { TemplateProps } from "../types";
import { useLandscape } from "./landscape";
import { WebPhoto } from "./WebPhoto";

/**
 * WEBSITE BANNER · 1600 × 1000. The shared photo (same treatment as the
 * Listing), with the SIS arc: a large quarter ellipse of SIS coral anchored
 * to the top-right corner, curving down to the right edge. The event info
 * sits inside it in normal auto layout (headline, then Date / Time / Venue
 * with bold labels, then the city); the arc is a decorative layer sized
 * from that content, so long text wraps and the arc grows to hold it, within
 * limits. Logos (SIS + partners) sit bottom-left on the photo.
 * Every piece of content is optional. Never uses the Instagram templates.
 *
 * Fit ladder: widen the info column (fewer lines, shorter arc), then
 * tighten spacing, then step the headline down to its floor.
 */
export const BANNER_LADDER: readonly FitStep[] = makeLadder(["30%", "35%", "40%", "45%", "50%"].map((v) => ({ "--info-max": v })));

/** Breathing room between the info's outer corner and the curve. */
const ARC_PAD = 48;
const INFO_SIZE = 30;
const INK = color("ink");

export function WebsiteBanner(props: TemplateProps) {
  const project = useLandscape(props.project);
  // Banner content is the headline and Date / Time / Venue / City only.
  const env: TemplateEnv = { ...useTemplateEnv({ ...props, project }), subheader: "", notes: "" };
  const { width, height } = env.format;
  const framing = webFraming(project, "website-banner", env.images.photo.state === "ready" ? env.images.photo.image : null);
  const ink = color("ink");
  const hasInfo = env.lines.length > 0 || env.details.length > 0 || !!env.city;

  return (
    <TemplateCanvas env={env} template="website-banner" ladder={BANNER_LADDER} check={bannerCheck} background={ink} onFit={props.onFit}>
      <WebPhoto slot={env.images.photo} framing={framing} landscape={landscapeNeed(project, env.images, framing, width, height)} record={project.photo.expansion} landscapeUrl={env.images.landscape?.state === "ready" ? env.images.landscape.image.url : undefined} generatingHint={env.mode === "editor" ? "Generating Website Banner…" : undefined} width={width} height={height} emptyGround={color("paper-warm")} hint={env.mode === "editor" ? "+ Add a photo" : undefined} />
      {/* A quarter ellipse centred on the top-right corner, stretched to the
          arc box (so --arc-w / --arc-h are its semi-axes). Outer corners square. */}
      <svg
        data-layer="decor"
        data-slot="arc"
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, right: 0, width: "var(--arc-w, 38%)", height: "var(--arc-h, 48%)", display: "block", overflow: "visible", pointerEvents: "none" }}
      >
        <path d="M0 0 A100 100 0 0 0 100 100 L100 0 Z" fill={COLORS.coral} data-fill="coral" />
      </svg>
      <Frame direction="column" padding={{ x: 64, y: 56 }} data-fit-box="true" style={{ position: "relative", width: "100%", height: "100%" }}>
        {hasInfo && (
          <Frame direction="column" align="start" gap={26} data-slot="arc-content" style={{ alignSelf: "flex-end", maxWidth: "var(--info-max, 30%)", flex: "0 0 auto" }}>
            {env.lines.length > 0 && <Title env={env} base={64} color={ink} />}
            {env.details.length > 0 && <InfoLines items={env.details} paint={env.paint} />}
            {env.city && (
              <div className="tpl-tag" data-slot="city" {...env.paint.attrs("city")} style={{ flex: "0 1 auto", background: ink, color: env.paint.color("city", color("off-white")), fontSize: `calc(var(--u) * 21)`, padding: "calc(var(--u) * 11) calc(var(--u) * 20)", borderRadius: "var(--r-subtle)" }}>
                {env.city}
              </div>
            )}
          </Frame>
        )}
        <Frame direction="row" data-slot="logo-bar" style={{ marginTop: "auto", maxWidth: "56%", flex: "0 0 auto" }}>
          <Logos env={env} base={92} align="start" />
        </Frame>
      </Frame>
    </TemplateCanvas>
  );
}

/** "Date: …" lines: bold labels in one column, values wrapping in the next. */
function InfoLines({ items, paint }: { items: DetailItem[]; paint: TextPaint }) {
  const text: CSSProperties = { fontFamily: "var(--font-body)", fontSize: `calc(var(--u) * ${INFO_SIZE})`, lineHeight: 1.22, color: color("ink"), overflowWrap: "anywhere" };
  return (
    <div data-slot="details" data-detail-style="banner-lines" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: "calc(var(--u) * 12)", rowGap: "calc(var(--u) * 10 * var(--sp, 1))", width: "100%" }}>
      {items.map((i) => (
        <div key={i.key} style={{ display: "contents" }}>
          <span data-detail-label={i.key} {...paint.attrs(`${i.key}-label`)} style={{ ...text, color: paint.color(`${i.key}-label`, INK), fontWeight: "var(--fw-bold)" as CSSProperties["fontWeight"] }}>
            {i.label}:
          </span>
          <span data-detail={i.key} {...(i.key === "date" ? {} : paint.attrs(i.key))} style={{ ...text, color: i.key === "date" ? INK : paint.color(i.key, INK), fontWeight: "var(--fw-medium)" as CSSProperties["fontWeight"], minWidth: 0 }}>
            <DetailText item={i} paint={paint} fallback={INK} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sizes the arc to the info it holds (sets --arc-w / --arc-h on the canvas)
 * and reports a problem when the arc would have to exceed its maximum or
 * would run under the logos. Measures in layout px, so the editor's scaled
 * preview gives the same answer as the export.
 */
export function bannerCheck(root: HTMLElement): string | null {
  const W = root.offsetWidth;
  const H = root.offsetHeight;
  const r = root.getBoundingClientRect();
  const k = r.width / W || 1;
  const u = parseFloat(getComputedStyle(root).getPropertyValue("--u")) || 1;
  const info = root.querySelector<HTMLElement>('[data-slot="arc-content"]');
  let reachX = 0;
  let reachY = 0;
  if (info) {
    const c = info.getBoundingClientRect();
    reachX = (r.right - c.left) / k;
    reachY = (c.bottom - r.top) / k;
  }
  const arc = arcFor(reachX, reachY, W, H, ARC_PAD * u);
  root.style.setProperty("--arc-w", `${Math.round(arc.a * 100) / 100}px`);
  root.style.setProperty("--arc-h", `${Math.round(arc.b * 100) / 100}px`);
  root.dataset.arc = `${Math.round(arc.a)}x${Math.round(arc.b)}`;
  if (!arc.fits) return "arc-too-big";
  // The logos' top-right corner must stay outside the arc.
  const logos = root.querySelector<HTMLElement>('[data-slot="logo-bar"]');
  if (logos) {
    const l = logos.getBoundingClientRect();
    if (insideArc((r.right - l.right) / k, (l.top - r.top) / k, arc)) return "logos-under-arc";
  }
  return null;
}
