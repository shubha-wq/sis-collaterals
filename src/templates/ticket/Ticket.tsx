import { color } from "@/design-system/tokens";
import { Frame, Layer } from "@/layout/Frame";
import type { FitStep } from "@/layout/types";
import { DetailTags } from "../shared/DetailStyles";
import { AddPhotoHint, Logos, TemplateCanvas, Title, TopBar, makeLadder, makeTypeOnlyLadder, overlayWithin, useTemplateEnv, type TemplateEnv } from "../shared/kit";
import { Photo } from "../shared/Photo";
import type { TemplateProps } from "../types";

/**
 * TICKET: a paper ticket. A photo and a perforated stub.
 *   Feed: photo on top (FILLS, down to a floor), the stub below it, joined
 *   by a dashed perforation. Banner: photo left, stub right, perforation
 *   between them.
 *   Stub: city line (accent square), headline, then details as Tags at the
 *   foot of the stub. Logos sit over the photo, top-right.
 *   No photo: the whole canvas is the ticket; logos join the city line, and
 *   a perforation separates the headline from the details.
 * Details: Tags.
 */

export const TICKET_LADDER_FEED: readonly FitStep[] = makeLadder(["36%", "32%", "28%", "24%"].map((v) => ({ "--photo-min": v })));
export const TICKET_LADDER_BANNER: readonly FitStep[] = makeLadder(["1", "0.85", "0.72", "0.6"].map((v) => ({ "--photo-flex": v })));
const TYPE_ONLY_HEADLINE = { feed: 1.35, banner: 1.25 } as const;
const PERFORATION = "calc(var(--u) * 3) dashed var(--ink)";

function CityLine({ env }: { env: TemplateEnv }) {
  if (!env.city) return null;
  return (
    <Frame direction="row" align="center" gap={11} style={{ minWidth: 0 }}>
      <span aria-hidden="true" style={{ width: 18 * env.u, height: 18 * env.u, flex: "none", background: color(env.accent.token) }} />
      <span className="tpl-tag" data-slot="city" {...env.paint.attrs("city")} style={{ color: env.paint.color("city", color(env.textOverride ?? "ink-soft")), fontSize: 23 * env.u, letterSpacing: "0.14em" }}>
        {env.city}
      </span>
    </Frame>
  );
}

function StubFoot({ env }: { env: TemplateEnv }) {
  const inkSoft = color(env.textOverride ?? "ink-soft");
  return (
    <>
      <DetailTags items={env.details} c={{ accent: color(env.accent.token), onAccent: color(env.accent.on), ink: color("ink"), inkSoft, line: color("paper-edge"), paint: env.paint }} />
      {env.notes && (
        <div style={{ display: "flex", justifyContent: "center", borderTop: `1px solid var(--paper-edge)`, paddingTop: 14 * env.u }}>
          <p className="tpl-notes" data-slot="notes" {...env.paint.attrs("notes")} style={{ color: env.paint.color("notes", inkSoft), fontSize: 22 * env.u, textAlign: "center", maxWidth: 520 * env.u }}>
            {env.notes}
          </p>
        </div>
      )}
    </>
  );
}

export function Ticket(props: TemplateProps) {
  const env = useTemplateEnv(props);
  const { portrait, typeOnly, m } = env;
  const ink = color(env.textOverride ?? "ink");
  const ladder = typeOnly ? makeTypeOnlyLadder() : portrait ? TICKET_LADDER_FEED : TICKET_LADDER_BANNER;

  return (
    <TemplateCanvas
      env={env}
      template="ticket"
      ladder={ladder}
      background={color("paper")}
      headlineScale={typeOnly ? TYPE_ONLY_HEADLINE[portrait ? "feed" : "banner"] : 1}
      check={(root) => (typeOnly ? null : overlayWithin(root, '[data-slot="top-bar"]', '[data-slot="photo"]'))}
      onFit={props.onFit}
    >
      {typeOnly ? (
        <Frame direction="column" padding={m} gap={22} data-fit-box="true" style={{ width: "100%", height: "100%" }}>
          <TopBar env={env} left={<CityLine env={env} />} logoBase={portrait ? 100 : 90} />
          <Title env={env} base={86} color={ink} />
          <Frame relative data-slot="space" style={{ flex: "1 1 0", minHeight: 30 * env.u }}>
            <AddPhotoHint env={env} ink={ink} />
          </Frame>
          {(env.details.length > 0 || env.notes) && (
            <Frame direction="column" gap={18} padding={{ top: 24 }} style={{ borderTop: PERFORATION }}>
              <StubFoot env={env} />
            </Frame>
          )}
        </Frame>
      ) : (
        <Frame direction={portrait ? "column" : "row"} data-fit-box="true" style={{ width: "100%", height: "100%" }}>
          <Frame relative data-slot="photo" style={portrait ? { flex: "1 1 0", minHeight: "var(--photo-min, 36%)" } : { flex: "var(--photo-flex, 1) 1 0", minWidth: 0 }}>
            <Photo slot={env.images.photo} settings={env.project.photo} emptyGround={color("paper-warm")} />
            <Layer inset={m}>
              <Frame direction="row" distribute="end" data-slot="top-bar">
                <Logos env={env} />
              </Frame>
            </Layer>
          </Frame>
          <Frame
            direction="column"
            gap={22}
            padding={{ x: m, top: m, bottom: m }}
            data-slot="panel"
            data-fit-box={portrait ? undefined : "true"}
            style={{
              ...(portrait ? { flex: "0 0 auto", borderTop: PERFORATION } : { flex: "1 1 0", minWidth: 0, overflow: "hidden", borderLeft: PERFORATION }),
            }}
          >
            <CityLine env={env} />
            <Title env={env} base={86} color={ink} />
            <Frame direction="column" gap={16} style={{ marginTop: "auto" }}>
              <StubFoot env={env} />
            </Frame>
          </Frame>
        </Frame>
      )}
    </TemplateCanvas>
  );
}
