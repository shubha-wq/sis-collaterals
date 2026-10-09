import { color } from "@/design-system/tokens";
import { labelOnPaper } from "@/design-system/brand";
import { Frame, Layer } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { DetailCards } from "../shared/DetailCards";
import { AddPhotoHint, CityTag, TemplateCanvas, Title, TopBar, makeLadder, makeTypeOnlyLadder, overlayWithin, useTemplateEnv, type TemplateEnv } from "../shared/kit";
import { Photo } from "../shared/Photo";
import type { TemplateProps } from "../types";

export { HEADLINE_FLOOR } from "../shared/kit";

/**
 * BLOCK: a photo and a solid colour panel; with no photo, a type-only colour
 * poster.
 *   Feed: the panel HUGS its content and the photo FILLS the rest (down to a floor).
 *   Banner: photo and panel share the width; the panel's content sits at the bottom.
 *   No photo: colour fills the canvas; city + logos form a top bar; the
 *   content sits at the bottom with a larger headline.
 * Details: Cards.
 */

export const BLOCK_LADDER_FEED: readonly FitStep[] = makeLadder(["36%", "32%", "28%", "24%"].map((v) => ({ "--photo-min": v })));
export const BLOCK_LADDER_BANNER: readonly FitStep[] = makeLadder(["1", "1.15", "1.3", "1.45"].map((v) => ({ "--panel-flex": v })));
export const BLOCK_LADDER_TYPE_ONLY: readonly FitStep[] = makeTypeOnlyLadder();
const TYPE_ONLY_HEADLINE = { feed: 1.45, banner: 1.3 } as const;

export function Block(props: TemplateProps) {
  const env = useTemplateEnv(props);
  const { portrait, typeOnly, accent, m } = env;
  const ladder = typeOnly ? BLOCK_LADDER_TYPE_ONLY : portrait ? BLOCK_LADDER_FEED : BLOCK_LADDER_BANNER;
  const tag = <CityTag env={env} bg={typeOnly ? color(accent.on) : color(accent.token)} fg={typeOnly ? color(accent.token) : color(accent.on)} />;

  return (
    <TemplateCanvas
      env={env}
      template="block"
      ladder={ladder}
      background={color(accent.token)}
      headlineScale={typeOnly ? TYPE_ONLY_HEADLINE[portrait ? "feed" : "banner"] : 1}
      check={(root) => (typeOnly ? null : overlayWithin(root, '[data-slot="top-bar"]', '[data-slot="photo"]'))}
      onFit={props.onFit}
    >
      {typeOnly ? (
        <Frame direction="column" padding={m} data-slot="panel" data-fit-box="true" style={{ width: "100%", height: "100%" }}>
          <TopBar env={env} left={tag} />
          <Frame relative data-slot="space" style={{ flex: "1 1 0", minHeight: 40 * env.u }}>
            <AddPhotoHint env={env} ink={env.onAccent} />
          </Frame>
          <BlockContent env={env} maxWidth={portrait ? undefined : 1180} />
        </Frame>
      ) : (
        <Frame direction={portrait ? "column" : "row"} data-fit-box="true" style={{ width: "100%", height: "100%" }}>
          <Frame relative data-slot="photo" style={portrait ? { flex: "1 1 0", minHeight: "var(--photo-min, 36%)" } : { flex: "1.15 1 0", minWidth: 0 }}>
            <Photo slot={env.images.photo} settings={env.project.photo} emptyGround={color(accent.tint)} />
            <Layer inset={m}>
              <TopBar env={env} left={tag} />
            </Layer>
          </Frame>
          <Frame
            data-slot="panel"
            direction="column"
            padding={{ x: m, top: m, bottom: m }}
            data-fit-box={portrait ? undefined : "true"}
            style={portrait ? { flex: "0 0 auto" } : { flex: "var(--panel-flex, 1) 1 0", minWidth: 0, overflow: "hidden" }}
          >
            <BlockContent env={env} anchorBottom={!portrait} />
          </Frame>
        </Frame>
      )}
    </TemplateCanvas>
  );
}

function BlockContent({ env, anchorBottom, maxWidth }: { env: TemplateEnv; anchorBottom?: boolean; maxWidth?: number }) {
  return (
    <Frame direction="column" gap={32} data-slot="content" style={{ marginTop: anchorBottom ? "auto" : undefined, maxWidth: maxWidth ? maxWidth * env.u : undefined }}>
      <Title env={env} base={100} color={env.onAccent} />
      <DetailCards items={env.details} labelColor={color(labelOnPaper(env.accent.id))} valueColor={color("ink")} plate={color("paper")} paint={env.paint} />
      {env.notes && (
        <p
          className="tpl-notes"
          data-slot="notes"
          {...env.paint.attrs("notes")}
          style={{ color: env.paint.color("notes", env.onAccentSoft), fontSize: 23 * env.u, textAlign: env.typeOnly ? "left" : "center", alignSelf: env.typeOnly ? "flex-start" : "center", maxWidth: 620 * env.u }}
        >
          {env.notes}
        </p>
      )}
    </Frame>
  );
}
