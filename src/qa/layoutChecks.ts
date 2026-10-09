import { CREATIVE_RADIUS, IMAGE_RADIUS } from "@/design-system/tokens";

/**
 * Geometry checks run on a rendered template in a real browser. These are
 * the automated part of the QA matrix: they catch overflow, clipping,
 * overlap, vanished elements and type below its floor.
 */

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const TEXT_SELECTORS = ['[data-slot="headline"]', '[data-slot="subheader"]', "[data-detail]", '[data-slot="notes"]', '[data-slot="city"]'];

function rectOf(el: Element, scale: number, origin: DOMRect) {
  const r = el.getBoundingClientRect();
  return { left: (r.left - origin.left) / scale, top: (r.top - origin.top) / scale, right: (r.right - origin.left) / scale, bottom: (r.bottom - origin.top) / scale, width: r.width / scale, height: r.height / scale };
}

type Box = ReturnType<typeof rectOf>;
const intersects = (a: Box, b: Box, tol = 1) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;

export function runLayoutChecks(root: HTMLElement, opts: { partners: number; expectCannotFit?: boolean; mustNotFit?: boolean; headlineFloorPx: number; width: number; height: number }): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });
  const origin = root.getBoundingClientRect();
  const scale = origin.width / root.offsetWidth || 1;
  const canvas = { left: 0, top: 0, right: root.offsetWidth, bottom: root.offsetHeight, width: root.offsetWidth, height: root.offsetHeight };

  // 1. Fit outcome.
  // Content marked "may not fit" passes either by fitting cleanly (every other
  // check must then pass) or by honestly reporting cannot-fit (export blocked).
  const fit = root.dataset.fit;
  const reportedCannotFit = fit === "cannot-fit";
  add("fit", opts.mustNotFit ? reportedCannotFit : opts.expectCannotFit ? true : !reportedCannotFit, `status ${fit}, step ${root.dataset.fitStep}`);

  // 2. No text overflows its own box (wraps instead).
  const texts = TEXT_SELECTORS.flatMap((s) => [...root.querySelectorAll<HTMLElement>(s)]);
  const overflowing = texts.filter((el) => el.dataset.break !== "true" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1));
  // A creative that reports cannot-fit is refused at export, so its overflow is expected (as for the checks below).
  add("no text overflow", reportedCannotFit || overflowing.length === 0, overflowing.map((e) => e.dataset.slot ?? e.dataset.detail).join(", "));

  // 3. Everything drawn sits inside the canvas (nothing clipped off the edge).
  const drawn = [...texts, ...root.querySelectorAll<HTMLElement>('[data-slot="logo"]')];
  const outside = drawn.filter((el) => {
    const r = rectOf(el, scale, origin);
    return r.left < canvas.left - 1 || r.top < canvas.top - 1 || r.right > canvas.right + 1 || r.bottom > canvas.bottom + 1;
  });
  add("inside canvas", reportedCannotFit || outside.length === 0, outside.map((e) => e.dataset.slot ?? e.dataset.detail ?? e.dataset.logo).join(", "));

  // 4. No two content elements overlap.
  const items = [
    ...texts.map((el) => ({ name: el.dataset.slot ?? `detail:${el.dataset.detail}`, box: rectOf(el, scale, origin) })),
    ...[...root.querySelectorAll<HTMLElement>('[data-slot="logo"]')].map((el) => ({ name: `logo:${el.dataset.logo}`, box: rectOf(el, scale, origin) })),
  ];
  const overlaps: string[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (intersects(items[i]!.box, items[j]!.box)) overlaps.push(`${items[i]!.name} × ${items[j]!.name}`);
  add("no overlap", reportedCannotFit || overlaps.length === 0, overlaps.join("; "));

  // 5. SIS always present and visible; partner count right.
  const sis = root.querySelector<HTMLElement>('[data-logo="sis"] img');
  add("SIS present", !!sis && sis.getBoundingClientRect().width > 0);
  const partners = root.querySelectorAll('[data-logo^="partner-"]').length;
  add("partner logos", partners === opts.partners, `${partners} of ${opts.partners}`);

  // 6. Headline never below its floor.
  const head = root.querySelector<HTMLElement>('[data-slot="headline"]');
  if (head) {
    const px = parseFloat(getComputedStyle(head).fontSize);
    add("headline ≥ floor", px >= opts.headlineFloorPx - 0.5, `${px.toFixed(1)}px (floor ${opts.headlineFloorPx.toFixed(1)}px)`);
  }

  // 7. Exports carry no editor hints; logos have no plate unless chosen.
  add("no editor hints", root.querySelectorAll('[data-hint="true"]').length === 0 || root.querySelector('[data-state="missing"]') !== null);
  const bg = root.querySelector<HTMLElement>('[data-slot="logos"]')?.dataset.logoBackground;
  const plated = [...root.querySelectorAll<HTMLElement>('[data-slot="logo"]')].filter((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)");
  add("logo plates match setting", bg === "none" ? plated.length === 0 : plated.length === root.querySelectorAll('[data-slot="logo"]').length, `${bg}: ${plated.length} plated`);

  // 8. Stacked panel elements keep visible space between them (≥ 12 units,
  //    which every template's gaps still clear at their tightest, 72%).
  const stack = ['[data-slot="title"]', '[data-slot="details"]', '[data-slot="notes"]']
    .map((sel) => root.querySelector<HTMLElement>(sel))
    .filter((el): el is HTMLElement => !!el)
    .map((el) => rectOf(el, scale, origin));
  const u = Math.min(root.offsetWidth, root.offsetHeight * 1.08) / 1080;
  const tight = stack.slice(1).map((r, i) => r.top - stack[i]!.bottom).filter((g) => g < 12 * u);
  add("spacing kept", reportedCannotFit || tight.length === 0, tight.map((g) => `${g.toFixed(0)}px`).join(", "));

  // 9. Canvas is exactly the export size, with square corners.
  add("canvas size", root.offsetWidth === opts.width && root.offsetHeight === opts.height, `${root.offsetWidth}×${root.offsetHeight}`);
  const cs = getComputedStyle(root);
  add("canvas square corners", [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].every((r) => parseFloat(r) === 0), cs.borderRadius);

  // 10. The photo stays inside the canvas.
  const fill = root.querySelector('[data-slot="photo-fill"]');
  if (fill) {
    const r = rectOf(fill, scale, origin);
    add("photo bounds", r.left >= -1 && r.top >= -1 && r.right <= canvas.right + 1 && r.bottom <= canvas.bottom + 1);
  }

  // 11. Partner logos never become unusably small (≥ 22 units tall or 60 wide).
  const tiny = [...root.querySelectorAll<HTMLImageElement>('[data-logo^="partner-"] img')].filter((img) => {
    const r = rectOf(img, scale, origin);
    return r.height < 22 * u && r.width < 60 * u;
  });
  add("logos usable size", tiny.length === 0, `${tiny.length} too small`);

  // 14. Event title: inside its area, clear of the photo, shrunk before
  //     wrapping, and wrapped into balanced lines without a dangling connector.
  if (head) results.push(...titleChecks(root, head, { scale, origin, floorPx: opts.headlineFloorPx, reportedCannotFit }));

  // 13. Photo corners: square on the canvas edge, the image radius inside.
  results.push(...photoCornerChecks(root));

  // 12. Photo is cropped, not distorted. (Website outputs place the photo at
  //     its own aspect ratio instead; webChecks verifies that.)
  const img = root.querySelector<HTMLImageElement>('[data-slot="photo-fill"] img');
  if (img && !(fill as HTMLElement | null)?.dataset.photoRect) add("photo not distorted", getComputedStyle(img).objectFit === "cover");

  return results;
}

const ONE_LINE_MIN_QA = 0.74;
const CONNECTOR_WORDS = new Set(["x", "×", "&", "+", "and", "of", "in", "the", "a", "at", "for", "with", "to", "on", "by", "vs", "vs.", "-", "–", "—", "|", "·"]);

/** The rendered lines of the title (per typed line), as lists of word elements, grouped by their line box. */
export function titleRenderedLines(head: HTMLElement): HTMLElement[][] {
  const out: HTMLElement[][] = [];
  for (const typed of head.querySelectorAll<HTMLElement>(".tpl-headline-line")) {
    let cur: HTMLElement[] = [];
    let top: number | null = null;
    for (const w of typed.querySelectorAll<HTMLElement>("[data-word]")) {
      if (top !== null && Math.abs(w.offsetTop - top) > 2) {
        out.push(cur);
        cur = [];
      }
      top = w.offsetTop;
      cur.push(w);
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

function titleChecks(root: HTMLElement, head: HTMLElement, o: { scale: number; origin: DOMRect; floorPx: number; reportedCannotFit: boolean }): CheckResult[] {
  const out: CheckResult[] = [];
  const max = Number(head.dataset.titleMax);
  out.push({ name: "title within its area", pass: o.reportedCannotFit || head.offsetHeight <= max + 1, detail: `${head.offsetHeight}px of ${max}px · ${head.dataset.titleLines} lines (max ${head.dataset.maxLines}) · ${head.dataset.titleFit}` });
  const h = rectOf(head, o.scale, o.origin);
  const photos = [...root.querySelectorAll<HTMLElement>('[data-slot="photo"]')].map((p) => rectOf(p, o.scale, o.origin));
  out.push({ name: "title clear of photo", pass: o.reportedCannotFit || !photos.some((p) => intersects(h, p)) });
  const fit = head.dataset.titleFit;
  if (fit === "wrapped" && !o.reportedCannotFit) {
    // Wrapping was a last resort: keeping one line would have needed more than the allowed shrink, or gone below the floor.
    const k = Number(head.dataset.oneLineK);
    const basePx = Number(head.dataset.basePx);
    out.push({ name: "shrinks before wrapping", pass: k < ONE_LINE_MIN_QA || basePx * k < o.floorPx + 0.5, detail: `one line needs ×${k}` });
    const lines = titleRenderedLines(head);
    const widths = lines.map((ws) => ws[ws.length - 1]!.offsetLeft + ws[ws.length - 1]!.offsetWidth - ws[0]!.offsetLeft);
    // Per typed line with 2+ rendered lines: no line under 35% of its widest sibling (no orphans).
    let orphan = false;
    let i = 0;
    for (const typed of head.querySelectorAll<HTMLElement>(".tpl-headline-line")) {
      const n = lines.filter((ws) => typed.contains(ws[0]!)).length;
      const group = widths.slice(i, i + n);
      if (n > 1 && Math.min(...group) < 0.35 * Math.max(...group)) orphan = true;
      i += n;
    }
    out.push({ name: "balanced title lines", pass: !orphan, detail: widths.map((w) => Math.round(w)).join(" / ") });
    const dangling = lines.slice(0, -1).filter((ws, j) => {
      const nextTyped = lines[j + 1]![0]!.closest(".tpl-headline-line") !== ws[0]!.closest(".tpl-headline-line");
      return !nextTyped && ws.length > 1 && CONNECTOR_WORDS.has((ws[ws.length - 1]!.textContent ?? "").toLowerCase());
    });
    out.push({ name: "no connector at line end", pass: dangling.length === 0, detail: dangling.map((ws) => ws.map((w) => w.textContent).join(" ")).join("; ") });
  }
  return out;
}

/**
 * Every photo's corners: square where the corner meets the canvas edge
 * (full-bleed), the image radius (IMAGE_RADIUS, --r-large) everywhere else,
 * with the photo clipped to that shape (overflow hidden on the rounded box).
 */
export function photoCornerChecks(root: HTMLElement): CheckResult[] {
  const origin = root.getBoundingClientRect();
  const scale = origin.width / root.offsetWidth || 1;
  const W = root.offsetWidth;
  const H = root.offsetHeight;
  const u = Math.min(W, H * 1.08) / 1080;
  const imageRadius = CREATIVE_RADIUS[IMAGE_RADIUS] * u;
  const out: CheckResult[] = [];
  for (const p of root.querySelectorAll<HTMLElement>('[data-slot="photo-fill"]')) {
    const r = rectOf(p, scale, origin);
    const cs = getComputedStyle(p);
    const onEdge = (x: number, y: number) => Math.abs(x) <= 1 || Math.abs(x - W) <= 1 || Math.abs(y) <= 1 || Math.abs(y - H) <= 1;
    const corners: Array<[string, number, number, string]> = [
      ["top-left", r.left, r.top, cs.borderTopLeftRadius],
      ["top-right", r.right, r.top, cs.borderTopRightRadius],
      ["bottom-left", r.left, r.bottom, cs.borderBottomLeftRadius],
      ["bottom-right", r.right, r.bottom, cs.borderBottomRightRadius],
    ];
    const wrong = corners.filter(([, x, y, rad]) => (onEdge(x, y) ? parseFloat(rad) !== 0 : Math.abs(parseFloat(rad) - imageRadius) > 0.5)).map(([n, , , rad]) => `${n} ${rad}`);
    const clipped = cs.overflow === "hidden";
    out.push({ name: "photo corners", pass: wrong.length === 0 && clipped, detail: wrong.join(", ") || (clipped ? `${corners.filter(([, x, y]) => !onEdge(x, y)).length} rounded` : "not clipped") });
  }
  return out;
}
