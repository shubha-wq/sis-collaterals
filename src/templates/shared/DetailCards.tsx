import { Frame } from "@/layout/Frame";
import type { DetailItem } from "./details";
import { DetailText } from "./DetailStyles";
import { DEFAULT_PAINT, type TextPaint } from "./paint";

/**
 * Event details as small paper cards ("Cards" style). Cards size to their
 * content and wrap: short values share a row; a long venue takes a row of
 * its own and its text wraps inside the card. Never truncated or shrunk.
 */
export function DetailCards({ items, labelColor, valueColor, plate, paint = DEFAULT_PAINT }: { items: DetailItem[]; labelColor: string; valueColor: string; plate: string; paint?: TextPaint }) {
  if (!items.length) return null;
  return (
    <Frame direction="row" wrap gap={10} width="fill" data-slot="details" data-detail-style="cards">
      {items.map((it) => (
        <div
          key={it.key}
          data-detail={it.key}
          style={{
            // Intrinsic: each card starts at its content's natural width,
            // then cards share leftover space; a value too long for the row
            // takes a row of its own and wraps inside the card.
            flex: "1 1 auto",
            minWidth: "calc(var(--u) * 180)",
            maxWidth: "100%",
            background: plate,
            borderRadius: "var(--r-medium)",
            padding: "calc(var(--u) * 14 * var(--sp, 1)) calc(var(--u) * 18)",
            display: "flex",
            flexDirection: "column",
            gap: "calc(var(--u) * 4)",
            boxSizing: "border-box",
          }}
        >
          <span className="tpl-detail-label" {...paint.attrs(`${it.key}-label`)} style={{ color: paint.color(`${it.key}-label`, labelColor) }}>
            {it.label}
          </span>
          <span
            className="tpl-detail-value"
            {...(it.key === "date" ? {} : paint.attrs(it.key))}
            style={{ color: it.key === "date" ? valueColor : paint.color(it.key, valueColor), fontSize: `calc(var(--u) * ${28 * it.emphasis})` }}
          >
            <DetailText item={it} paint={paint} fallback={valueColor} />
          </span>
        </div>
      ))}
    </Frame>
  );
}
