import { Frame } from "@/layout/Frame";
import type { EventContent } from "@/model/project";
import type { DetailItem } from "./details";
import { DEFAULT_PAINT, type TextPaint } from "./paint";

/**
 * The detail treatments from the original SIS DetailBox, rebuilt on flow
 * layout. Each template uses exactly one (no user-facing selector):
 *   Block → Cards · Slab → Rows · Ticket → Tags · Broadsheet → Ledger · Poster → Inline
 * Empty fields never render; long values wrap inside their own element.
 */

export interface DetailColors {
  accent: string;
  onAccent: string;
  ink: string;
  inkSoft: string;
  /** Hairlines and rules. */
  line: string;
  /** Per-block colour overrides (the template's env.paint). */
  paint?: TextPaint;
}

const px = (n: number) => `calc(var(--u) * ${n})`;

/**
 * A detail's value text. The date value is split into date and day spans so
 * each takes its own colour; any other value is one block. `fallback` is the
 * template's colour for the value.
 */
export function DetailText({ item, paint = DEFAULT_PAINT, fallback }: { item: DetailItem; paint?: TextPaint; fallback: string }) {
  if (item.key === "date" && item.parts && item.parts.length > 0) {
    return (
      <>
        {item.parts.map((p) => (
          <span key={p.role} {...paint.attrs(p.role)} style={{ color: paint.color(p.role, fallback) }}>
            {p.text}
          </span>
        ))}
      </>
    );
  }
  return <>{item.value}</>;
}

/** Role and colour props for a detail value element (non-date keys carry the role themselves). */
function valueProps(item: DetailItem, paint: TextPaint, fallback: string) {
  // The date's colour lives on its date/day spans; the element keeps the template colour.
  if (item.key === "date") return { color: fallback, attrs: {} };
  return { color: paint.color(item.key, fallback), attrs: paint.attrs(item.key) };
}

/** ROWS: a bordered table; accent label cells, values beside them. */
export function DetailRows({ items, c }: { items: DetailItem[]; c: DetailColors }) {
  if (!items.length) return null;
  return (
    <div data-slot="details" data-detail-style="rows" style={{ display: "flex", flexDirection: "column", border: `${px(2)} solid ${c.accent}`, borderRadius: "var(--r-subtle)", overflow: "hidden", width: "100%" }}>
      {items.map((it, i) => (
        <div key={it.key} data-detail={it.key} style={{ display: "grid", gridTemplateColumns: `minmax(0, ${px(180)}) minmax(0, 1fr)`, borderTop: i === 0 ? "none" : `${px(2)} solid ${c.accent}` }}>
          <span className="tpl-detail-label" {...paint(c).attrs(`${it.key}-label`)} style={{ background: c.accent, color: paint(c).color(`${it.key}-label`, c.onAccent), padding: `${px(14)} ${px(18)}`, display: "flex", alignItems: "center" }}>
            {it.label}
          </span>
          <span className="tpl-detail-value" {...valueProps(it, paint(c), c.ink).attrs} style={{ color: valueProps(it, paint(c), c.ink).color, fontSize: px(30 * it.emphasis), padding: `${px(12)} ${px(22)}`, display: "block", alignSelf: "center", minWidth: 0 }}>
            <DetailText item={it} paint={paint(c)} fallback={c.ink} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** TAGS: each value is a solid accent tag; tags wrap. */
export function DetailTags({ items, c }: { items: DetailItem[]; c: DetailColors }) {
  if (!items.length) return null;
  return (
    <Frame direction="row" wrap gap={12} width="fill" data-slot="details" data-detail-style="tags">
      {items.map((it) => (
        <span
          key={it.key}
          data-detail={it.key}
          className="tpl-detail-value"
          {...valueProps(it, paint(c), c.onAccent).attrs}
          style={{ flex: "0 1 auto", maxWidth: "100%", minWidth: 0, background: c.accent, color: valueProps(it, paint(c), c.onAccent).color, fontSize: px(30 * it.emphasis), lineHeight: 1.1, padding: `${px(13)} ${px(20)}`, borderRadius: "var(--r-subtle)" }}
        >
          <DetailText item={it} paint={paint(c)} fallback={c.onAccent} />
        </span>
      ))}
    </Frame>
  );
}

/** INLINE: one typeset run, values separated by accent dots; wraps between items. */
export function DetailInline({ items, c }: { items: DetailItem[]; c: DetailColors }) {
  if (!items.length) return null;
  return (
    <Frame direction="row" wrap align="center" gap={20} rowGap={8} width="fill" data-slot="details" data-detail-style="inline">
      {items.map((it, i) => (
        <span key={it.key} style={{ display: "flex", alignItems: "center", gap: px(20), minWidth: 0, maxWidth: "100%" }}>
          {i > 0 && <span aria-hidden="true" style={{ width: px(9), height: px(9), borderRadius: "50%", background: c.accent, flex: "none" }} />}
          <span data-detail={it.key} className="tpl-detail-value" {...valueProps(it, paint(c), c.ink).attrs} style={{ color: valueProps(it, paint(c), c.ink).color, fontSize: px(34 * it.emphasis), lineHeight: 1.14, minWidth: 0 }}>
            <DetailText item={it} paint={paint(c)} fallback={c.ink} />
          </span>
        </span>
      ))}
    </Frame>
  );
}

/** Space below the ledger numeral's baseline inside its natural line box (≈ 0.25em at 112 units). */
const NUMERAL_DESCENT = 28;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day number and short month read from free text (e.g. a typed "<day>th <month>"). */
export function parseDate(date: string): { num: string; month: string } {
  const num = (date.match(/\d+/) ?? [""])[0];
  const lower = date.toLowerCase();
  const month = MONTHS.find((m) => lower.includes(m.toLowerCase())) ?? "";
  return { num, month };
}

/**
 * LEDGER: the date set large (number + month/day), time and venue to the
 * right, a dotted rule beneath. Falls back gracefully: no recognisable day
 * number → the date text sits in the stack; no date → time and venue only.
 */
export function DetailLedger({ items, content, c }: { items: DetailItem[]; content: EventContent; c: DetailColors }) {
  if (!items.length) return null;
  const hasDate = items.some((i) => i.key === "date");
  const { num, month } = parseDate(content.date);
  const showNum = hasDate && !!num;
  const day = content.day.trim();
  const time = items.find((i) => i.key === "time")?.value;
  const venue = items.find((i) => i.key === "venue")?.value;
  const pt = paint(c);
  // With no date typed, the date slot shows the day.
  const dateRole = content.date.trim() ? "date" : "day";
  return (
    <Frame direction="column" gap={10} width="fill" data-slot="details" data-detail-style="ledger">
      <Frame direction="row" wrap align="end" gap={18} rowGap={14} distribute="space-between">
        {hasDate && (
          <div data-detail="date" style={{ display: "flex", alignItems: "flex-end", gap: px(16), flex: "0 1 auto", minWidth: 0 }}>
            {showNum && (
              <span {...pt.attrs("date")} style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-black)", fontSize: px(112), lineHeight: "normal", letterSpacing: "-0.04em", color: pt.color("date", c.accent) }}>{num}</span>
            )}
            {/* The numeral keeps its natural line box (so nothing it draws sits outside it); the stack
                beside it is padded by the numeral's descent so their baselines line up. */}
            <span style={{ display: "flex", flexDirection: "column", gap: px(2), paddingBottom: showNum ? px(NUMERAL_DESCENT) : 0, minWidth: 0 }}>
              <span className="tpl-detail-value" {...pt.attrs(dateRole)} style={{ fontSize: px(showNum ? 30 : 34), letterSpacing: "0.06em", textTransform: "uppercase", color: pt.color(dateRole, c.ink), lineHeight: 1.15 }}>
                {showNum ? month || content.date.replace(num, "").replace(/^(st|nd|rd|th)\b/i, "").trim() : content.date.trim() || day}
              </span>
              {day && (showNum || content.date.trim()) && (
                <span className="tpl-detail-value" {...pt.attrs("day")} style={{ fontSize: px(21), letterSpacing: "0.14em", textTransform: "uppercase", color: pt.color("day", c.inkSoft), lineHeight: 1.2 }}>{day}</span>
              )}
            </span>
          </div>
        )}
        {(time || venue) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: hasDate ? "flex-end" : "flex-start", textAlign: hasDate ? "right" : "left", gap: px(2), flex: "1 1 auto", minWidth: 0, paddingBottom: px(showNum ? NUMERAL_DESCENT - 4 : 6) }}>
            {time && (
              <span data-detail="time" className="tpl-detail-value" {...pt.attrs("time")} style={{ fontSize: px(fitSize(time, 232)), color: pt.color("time", c.ink), lineHeight: 1.2, maxWidth: "100%" }}>{time}</span>
            )}
            {venue && (
              <span data-detail="venue" className="tpl-detail-value" {...pt.attrs("venue")} style={{ fontSize: px(fitSize(venue, 320)), color: pt.color("venue", c.inkSoft), lineHeight: 1.2, maxWidth: "100%" }}>{venue}</span>
            )}
          </div>
        )}
      </Frame>
      <div aria-hidden="true" style={{ height: px(3), width: "100%", backgroundImage: `repeating-linear-gradient(to right, ${c.accent} 0 ${px(8)}, transparent ${px(8)} ${px(16)})` }} />
    </Frame>
  );
}

function paint(c: DetailColors): TextPaint {
  return c.paint ?? DEFAULT_PAINT;
}

/** Ledger lines size to their length (22–40 units) so stacked lines feel even. Long ones wrap. */
function fitSize(s: string, target: number): number {
  return Math.round(Math.max(26, Math.min(40, target / (Math.max(s.length, 1) * 0.56))));
}
