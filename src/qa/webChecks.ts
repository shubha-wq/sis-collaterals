import { ARC_LIMITS, insideArc } from "@/layout/arc";
import { resolveFill } from "@/layout/webPhotoPlan";
import { COLORS } from "@/design-system/tokens";
import type { WebOutputId } from "@/model/outputs";
import type { WebFraming } from "@/model/outputs";
import { photoCornerChecks, type CheckResult } from "./layoutChecks";

/**
 * Geometry checks for the website outputs, on top of the shared layout
 * checks (Banner) or on their own (Listing). Measured in canvas px.
 */
export function runWebChecks(
  root: HTMLElement,
  opts: { output: WebOutputId; source: { width: number; height: number; url?: string } | null; framing: WebFraming; reportedCannotFit: boolean; landscape?: "ready" | "pending" | "unavailable" | "failed" },
): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });
  const W = root.offsetWidth;
  const H = root.offsetHeight;
  const origin = root.getBoundingClientRect();
  const k = origin.width / W || 1;
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: (r.left - origin.left) / k, top: (r.top - origin.top) / k, right: (r.right - origin.left) / k, bottom: (r.bottom - origin.top) / k };
  };

  add("exactly 1600 × 1000", W === 1600 && H === 1000, `${W}×${H}`);
  add("no template", root.dataset.template === opts.output, root.dataset.template);

  // Photo: drawn once, at its own aspect ratio; covers the frame (crop) or is wholly visible (fit).
  const layer = root.querySelector<HTMLElement>('[data-layer="photo"]');
  const img = root.querySelector<HTMLImageElement>('[data-slot="photo-image"]');
  if (opts.source) {
    const s = opts.source;
    add("photo drawn", !!img && !!layer?.dataset.photoRect);
    if (img && layer?.dataset.photoRect) {
      const [x, y, w, h] = layer.dataset.photoRect.split(",").map(Number) as [number, number, number, number];
      const ratio = w / h / (s.width / s.height);
      add("aspect preserved (no stretch)", Math.abs(ratio - 1) < 0.002, `ratio ${ratio.toFixed(4)}`);
      add("rendered at planned size", Math.abs(img.offsetWidth - w) <= 1 && Math.abs(img.offsetHeight - h) <= 1, `${img.offsetWidth}×${img.offsetHeight} vs ${w.toFixed(1)}×${h.toFixed(1)}`);
      const mode = layer.dataset.fill;
      add("fill mode follows rule", mode === resolveFill(opts.framing, s.width, s.height, W, H), `${mode}`);
      if (mode === "crop") add("crop covers frame", x <= 0.5 && y <= 0.5 && x + w >= W - 0.5 && y + h >= H - 0.5);
      else add("whole photo visible", x >= -0.5 && y >= -0.5 && x + w <= W + 0.5 && y + h <= H + 0.5);
      add("photo appears once", root.querySelectorAll('[data-slot="photo-image"]').length === 1);
      if (mode === "fit" && (w < W - 1 || h < H - 1)) {
        const want = opts.landscape ?? "ready";
        if (want === "ready") {
          // The AI landscape fills the canvas; the untouched original is drawn on top of it, exactly on its planned rectangle.
          const land = root.querySelector<HTMLImageElement>('[data-slot="photo-landscape"]');
          add("AI landscape behind the photo", !!land && layer.dataset.landscape === "ai", layer.dataset.landscape);
          if (land) {
            const lx = parseFloat(land.style.left);
            const ly = parseFloat(land.style.top);
            add("landscape covers the canvas", lx <= 0.5 && ly <= 0.5 && lx + land.offsetWidth >= W - 0.5 && ly + land.offsetHeight >= H - 0.5, `${Math.round(lx)},${Math.round(ly)} ${land.offsetWidth}×${land.offsetHeight}`);
            add("original drawn on top", !!(land.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING));
            add("original photo untouched", !opts.source?.url || img.getAttribute("src") === opts.source.url, img.getAttribute("src")?.slice(0, 40));
            add("no edge fill when AI is ready", !root.querySelector('[data-slot="photo-extension"]'));
          }
        } else if (want === "unavailable") {
          add("edge fill fallback (AI not configured)", layer.dataset.landscape === "fallback" && !!root.querySelector('[data-slot="photo-extension"]') && layer.dataset.pending !== "true");
        } else {
          add(`waiting for landscape (${want})`, layer.dataset.landscape === (want === "pending" ? "generating" : "failed") && !root.querySelector('[data-slot="photo-landscape"], [data-slot="photo-extension"]'), layer.dataset.landscape);
        }
      }
    }
  }

  const arc = root.querySelector<SVGElement>('[data-slot="arc"]');
  if (opts.output === "website-listing") {
    results.push(...photoCornerChecks(root));
    add("no arc", !arc);
    add("no text", !root.querySelector('[data-slot="headline"], [data-detail], [data-slot="city"]'));
    add("no logos", !root.querySelector('[data-slot="logo"]'));
    return results;
  }

  // Banner arc: present, SIS coral, anchored top-right, bold, holds the info.
  add("arc present", !!arc);
  if (!arc) return results;
  const path = arc.querySelector("path");
  add("arc is SIS coral", path?.getAttribute("fill")?.toUpperCase() === COLORS.coral.toUpperCase(), path?.getAttribute("fill") ?? "");
  const a = box(arc);
  add("arc anchored top-right", Math.abs(a.top) <= 0.5 && Math.abs(a.right - W) <= 0.5, `top ${a.top.toFixed(1)}, right ${(W - a.right).toFixed(1)}`);
  const ax = a.right - a.left;
  const ay = a.bottom - a.top;
  add("arc is large", ax >= ARC_LIMITS.minW * W - 1 && ay >= ARC_LIMITS.minH * H - 1, `${Math.round(ax)}×${Math.round(ay)}`);
  add("arc within limits", opts.reportedCannotFit || (ax <= ARC_LIMITS.maxW * W + 1 && ay <= ARC_LIMITS.maxH * H + 1));
  const ellipse = { a: ax, b: ay };
  const content = [...root.querySelectorAll('[data-slot="headline"], [data-detail], [data-detail-label], [data-slot="city"]')];
  const outside = content.filter((el) => {
    const r = box(el);
    // Far corner (bottom-left) is the only one that can leave a top-right quarter ellipse.
    return !insideArc(W - r.left, r.bottom, ellipse);
  });
  add("info inside arc", opts.reportedCannotFit || outside.length === 0, outside.map((e) => (e as HTMLElement).dataset.slot ?? (e as HTMLElement).dataset.detail ?? (e as HTMLElement).dataset.detailLabel).join(", "));
  const logos = [...root.querySelectorAll('[data-slot="logo"]')].filter((el) => {
    const r = box(el);
    return insideArc(W - r.right, r.top, ellipse);
  });
  add("logos clear of arc", logos.length === 0, `${logos.length} under arc`);
  // Default colour (no override chosen): ink on coral.
  const plain = root.querySelector<HTMLElement>('[data-text-role="time"]:not([data-text-override]), [data-slot="headline"]:not([data-text-override])');
  if (plain) add("info is ink on coral", getComputedStyle(plain).color === "rgb(17, 4, 5)", getComputedStyle(plain).color);
  return results;
}
