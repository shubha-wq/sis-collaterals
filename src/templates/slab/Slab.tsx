import { color } from "@/design-system/tokens";
import { Frame } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { DetailRows } from "../shared/DetailStyles";
import { AddPhotoHint, TemplateCanvas, Title, TopBar, makeLadder, makeTypeOnlyLadder, useTemplateEnv, type TemplateEnv } from "../shared/kit";
import { Photo } from "../shared/Photo";
import type { TemplateProps } from "../types";

/**
 * SLAB: a solid block floating on a full-bleed photo.
 *   The photo is the background layer. A column on top: city tag + logos,
 *   open space, then the slab: it HUGS its content, sits inside the margins
 *   (so it takes a soft corner), with a heavy rule along its top edge.
 *   Feed: the slab spans the margins. Banner: the slab is capped to ~62% of
 *   the width and may widen when content needs it.
 *   No photo: the slab sits on the opposite ground (ink under a colour slab,
 *   colour under an ink slab).
 * Slab colour: Colour (default) or Ink (Fine-tune). Details: Rows.
 */

export const SLAB_LADDER_FEED: readonly FitStep[] = makeLadder([{}]);
export const SLAB_LADDER_BANNER: readonly FitStep[] = makeLadder(["62%", "70%", "78%", "86%"].map((v) => ({ "--slab-max": v })));
const TYPE_ONLY_HEADLINE = { feed: 1.2, banner: 1.15 } as const;

function palette(env: TemplateEnv) {
  const onColour = (env.project.overrides.blockColour ?? "accent") === "accent";
  const slab = color(onColour ? env.accent.token : "ink");
  const ink = color(env.textOverride ?? (onColour ? env.accent.on : "off-white"));
  const inkSoft = env.textOverride ? color(env.textOverride) : onColour ? env.onAccentSoft : color("off-white");
  // The rule and the row labels contrast with the slab: ink on a colour slab, colour on an ink slab.
  const rule = color(onColour ? "ink" : env.accent.token);
  const ruleText = color(onColour ? "off-white" : env.accent.on);
  return { slab, ink, inkSoft, rule, ruleText, ground: color(onColour ? "ink" : env.accent.token) };
}

export function Slab(props: TemplateProps) {
  const env = useTemplateEnv(props);
  const { portrait, typeOnly, m } = env;
  const p = palette(env);
  const ladder = typeOnly ? makeTypeOnlyLadder() : portrait ? SLAB_LADDER_FEED : SLAB_LADDER_BANNER;

  const tag = env.city ? (
    <div className="tpl-tag" data-slot="city" {...env.paint.attrs("city")} style={{ flex: "0 1 auto", background: p.slab, color: env.paint.color("city", p.ink), fontSize: 19 * env.u, padding: `${11 * env.u}px ${20 * env.u}px`, borderRadius: "var(--r-subtle)" }}>
      {env.city}
    </div>
  ) : null;

  return (
    <TemplateCanvas env={env} template="slab" ladder={ladder} background={p.ground} headlineScale={typeOnly ? TYPE_ONLY_HEADLINE[portrait ? "feed" : "banner"] : 1} onFit={props.onFit}>
      {!typeOnly && <Photo slot={env.images.photo} settings={env.project.photo} emptyGround={color("ink-soft")} />}
      <Frame direction="column" padding={m} data-fit-box="true" style={{ position: "relative", width: "100%", height: "100%" }}>
        <TopBar env={env} left={tag} />
        <Frame relative data-slot="space" style={{ flex: "1 1 0", minHeight: 30 * env.u }}>
          {typeOnly && <AddPhotoHint env={env} ink={color("off-white")} />}
        </Frame>
        <Frame
          direction="column"
          gap={20}
          padding={36}
          data-slot="panel"
          style={{
            flex: "0 0 auto",
            width: portrait ? "100%" : undefined,
            maxWidth: portrait ? "100%" : "var(--slab-max, 62%)",
            alignSelf: "flex-start",
            background: p.slab,
            borderTop: `calc(var(--u) * 6) solid ${p.rule}`,
            borderRadius: "var(--r-subtle)",
          }}
        >
          <Title env={env} base={94} color={p.ink} />
          <DetailRows items={env.details} c={{ accent: p.rule, onAccent: p.ruleText, ink: p.ink, inkSoft: p.inkSoft, line: p.rule, paint: env.paint }} />
          {env.notes && (
            <p className="tpl-notes" data-slot="notes" {...env.paint.attrs("notes")} style={{ color: env.paint.color("notes", p.inkSoft), fontSize: 21 * env.u, textAlign: "center", alignSelf: "center", maxWidth: 560 * env.u }}>
              {env.notes}
            </p>
          )}
        </Frame>
      </Frame>
    </TemplateCanvas>
  );
}
