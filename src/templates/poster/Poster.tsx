import { color } from "@/design-system/tokens";
import { Frame } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { DetailInline } from "../shared/DetailStyles";
import { AddPhotoHint, TemplateCanvas, Title, TopBar, makeLadder, makeTypeOnlyLadder, useTemplateEnv } from "../shared/kit";
import { Photo } from "../shared/Photo";
import type { TemplateProps } from "../types";

/**
 * POSTER: a full-bleed photo with the type set on a dark fade.
 *   The photo is the background layer (the one genuinely overlapping
 *   element). Everything else is a column: city block + logos at the top,
 *   open space, then the content panel at the bottom. The panel carries its
 *   own fade, so the fade grows with the content instead of being a fixed
 *   share of the canvas.
 *   Banner: the same, with the content column capped for line length.
 *   No photo: a dark ink poster with the same type and accent bar.
 * Details: Inline.
 */

/**
 * Share step: the fade's lead-in above the content shortens before anything
 * else tightens. The banner is shorter, so its fade starts lower and the
 * photo keeps more of the frame.
 */
export const POSTER_LADDER: readonly FitStep[] = makeLadder(["260", "200", "140", "90"].map((v) => ({ "--fade": v })));
export const POSTER_LADDER_BANNER: readonly FitStep[] = makeLadder(["150", "110", "80", "50"].map((v) => ({ "--fade": v })));
const TYPE_ONLY_HEADLINE = { feed: 1.25, banner: 1.15 } as const;
const OFF_WHITE = "var(--off-white)";

export function Poster(props: TemplateProps) {
  const env = useTemplateEnv(props);
  const { portrait, typeOnly, accent, m } = env;
  const ink = color(env.textOverride ?? "off-white");
  const ladder = typeOnly ? makeTypeOnlyLadder() : portrait ? POSTER_LADDER : POSTER_LADDER_BANNER;

  const cityBlock = env.city ? (
    <div className="tpl-tag" data-slot="city" {...env.paint.attrs("city")} style={{ flex: "0 1 auto", background: color(accent.token), color: env.paint.color("city", color(accent.on)), fontSize: 22 * env.u, padding: `${12 * env.u}px ${20 * env.u}px`, borderRadius: "var(--r-subtle)" }}>
      {env.city}
    </div>
  ) : null;

  return (
    <TemplateCanvas env={env} template="poster" ladder={ladder} background={color("ink")} headlineScale={typeOnly ? TYPE_ONLY_HEADLINE[portrait ? "feed" : "banner"] : 1} onFit={props.onFit}>
      {!typeOnly && <Photo slot={env.images.photo} settings={env.project.photo} emptyGround={color("ink-soft")} />}
      <Frame direction="column" data-fit-box="true" style={{ position: "relative", width: "100%", height: "100%" }}>
        <Frame direction="column" padding={{ x: m, top: m }}>
          <TopBar env={env} left={cityBlock} />
        </Frame>
        <Frame relative data-slot="space" style={{ flex: "1 1 0", minHeight: 20 * env.u }}>
          {typeOnly && <AddPhotoHint env={env} ink={OFF_WHITE} />}
        </Frame>
        <Frame
          direction="column"
          data-slot="panel"
          style={{
            flex: "0 0 auto",
            padding: `calc(var(--u) * var(--fade, ${portrait ? 260 : 150}) * var(--sp, 1)) ${m * env.u}px ${m * env.u}px`,
            background: typeOnly ? "transparent" : "linear-gradient(to top, rgba(17,4,5,.96) 0%, rgba(17,4,5,.86) 55%, rgba(17,4,5,0) 100%)",
          }}
        >
          <Frame direction="column" gap={26} data-slot="content" style={{ maxWidth: portrait ? undefined : 1150 * env.u }}>
            <Title env={env} base={118} color={ink} />
            <span aria-hidden="true" style={{ display: "block", height: 5 * env.u, width: 96 * env.u, background: color(accent.token) }} />
            <DetailInline items={env.details} c={{ accent: color(accent.token), onAccent: color(accent.on), ink, inkSoft: ink, line: "rgba(250,240,228,.3)", paint: env.paint }} />
            {env.notes && (
              <p className="tpl-notes" data-slot="notes" {...env.paint.attrs("notes")} style={{ color: env.paint.color("notes", ink), fontSize: 24 * env.u, maxWidth: 700 * env.u }}>
                {env.notes}
              </p>
            )}
          </Frame>
        </Frame>
      </Frame>
    </TemplateCanvas>
  );
}
