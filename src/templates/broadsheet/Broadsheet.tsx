import { color, type ColorToken } from "@/design-system/tokens";
import { Frame } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { DetailLedger } from "../shared/DetailStyles";
import { AddPhotoHint, Logos, TemplateCanvas, Title, makeLadder, makeTypeOnlyLadder, useTemplateEnv, type TemplateEnv } from "../shared/kit";
import { Photo } from "../shared/Photo";
import type { TemplateProps } from "../types";

/**
 * BROADSHEET: an editorial page.
 *   Masthead: accent square + city, logos right, ruled off in ink.
 *   Feed: headline over an inset photo (soft corners; it sits inside the
 *   margins); the photo FILLS what the headline leaves, down to a floor.
 *   Banner: headline column beside the photo.
 *   Foot: the date as a large Ledger, then notes with an accent bar.
 *   No photo: the headline leads the page, larger; details sit at the foot.
 * Ground: Paper (default), Tint or Colour (Fine-tune).
 */

export const BROADSHEET_LADDER_FEED: readonly FitStep[] = makeLadder(["36%", "32%", "28%", "24%"].map((v) => ({ "--photo-min": v })));
export const BROADSHEET_LADDER_BANNER: readonly FitStep[] = makeLadder(["1", "0.85", "0.7", "0.58"].map((v) => ({ "--photo-flex": v })));
const TYPE_ONLY_HEADLINE = { feed: 1.35, banner: 1.25 } as const;

function palette(env: TemplateEnv) {
  const ground = env.project.overrides.paperGround ?? "paper";
  const onColour = ground === "accent";
  const bg: ColorToken = ground === "accent" ? env.accent.token : ground === "tint" ? env.accent.tint : "paper";
  const ink = onColour ? env.onAccent : color(env.textOverride ?? "ink");
  const inkSoft = onColour ? env.onAccentSoft : color(env.textOverride ?? "ink-soft");
  return {
    bg: color(bg),
    ink,
    inkSoft,
    mark: onColour ? env.onAccent : color(env.accent.token),
    line: onColour ? "rgba(17,4,5,.28)" : color("paper-edge"),
    photoEmpty: color(onColour ? "paper" : env.accent.tint),
  };
}

export function Broadsheet(props: TemplateProps) {
  const env = useTemplateEnv(props);
  const { portrait, typeOnly, m } = env;
  const p = palette(env);
  const ladder = typeOnly ? makeTypeOnlyLadder() : portrait ? BROADSHEET_LADDER_FEED : BROADSHEET_LADDER_BANNER;
  const details = { accent: p.mark, onAccent: color(env.accent.on), ink: p.ink, inkSoft: p.inkSoft, line: p.line, paint: env.paint };

  return (
    <TemplateCanvas env={env} template="broadsheet" ladder={ladder} background={p.bg} headlineScale={typeOnly ? TYPE_ONLY_HEADLINE[portrait ? "feed" : "banner"] : 1} onFit={props.onFit}>
      <Frame direction="column" padding={m} gap={24} data-fit-box="true" style={{ width: "100%", height: "100%" }}>
        {/* Masthead */}
        <Frame direction="row" wrap align="center" distribute="space-between" gap={20} rowGap={12} padding={{ bottom: 14 }} style={{ borderBottom: `calc(var(--u) * 2) solid ${p.ink}` }} data-slot="top-bar">
          <Frame direction="row" align="center" gap={12} style={{ minWidth: 0, flex: "0 1 auto" }}>
            <span aria-hidden="true" style={{ width: 20 * env.u, height: 20 * env.u, flex: "none", background: p.mark }} />
            {env.city && (
              <span className="tpl-tag" data-slot="city" {...env.paint.attrs("city")} style={{ color: env.paint.color("city", p.ink), fontSize: 24 * env.u, letterSpacing: "0.14em" }}>
                {env.city}
              </span>
            )}
          </Frame>
          <Logos env={env} base={portrait ? 96 : 88} />
        </Frame>

        {typeOnly ? (
          <>
            <Title env={env} base={104} color={p.ink} subColor={p.inkSoft} />
            <Frame relative data-slot="space" style={{ flex: "1 1 0", minHeight: 30 * env.u }}>
              <AddPhotoHint env={env} ink={p.ink} />
            </Frame>
          </>
        ) : (
          <Frame direction={portrait ? "column" : "row"} gap={24} data-fit-box="true" data-slot="body" style={{ flex: "1 1 0", minHeight: 0 }}>
            <Frame direction="column" style={portrait ? { flex: "0 0 auto" } : { flex: "1 1 0", minWidth: 0 }}>
              <Title env={env} base={104} color={p.ink} subColor={p.inkSoft} />
            </Frame>
            <Frame
              relative
              data-slot="photo"
              style={{
                ...(portrait ? { flex: "1 1 0", minHeight: "var(--photo-min, 36%)" } : { flex: "var(--photo-flex, 1) 1 0", minWidth: 0 }),
                // Contained photo: the image radius (IMAGE_RADIUS = large); the photo is clipped to it.
                borderRadius: "var(--r-large)",
                overflow: "hidden",
              }}
            >
              <Photo slot={env.images.photo} settings={env.project.photo} emptyGround={p.photoEmpty} />
            </Frame>
          </Frame>
        )}

        <DetailLedger items={env.details} content={env.project.content} c={details} />
        {env.notes && (
          <div style={{ display: "flex", gap: 12 * env.u, borderTop: `1px solid ${p.line}`, paddingTop: 14 * env.u }}>
            <span aria-hidden="true" style={{ width: 6 * env.u, flex: "none", alignSelf: "stretch", background: p.mark }} />
            <p className="tpl-notes" data-slot="notes" {...env.paint.attrs("notes")} style={{ color: env.paint.color("notes", p.inkSoft), fontSize: 24 * env.u, maxWidth: 700 * env.u }}>
              {env.notes}
            </p>
          </div>
        )}
      </Frame>
    </TemplateCanvas>
  );
}
