import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { FitResult, FitStep } from "./types";

/**
 * Content-aware fitting. After every render that could change size, walk the
 * template's fit ladder, applying each rung as CSS custom properties on the
 * canvas root (--sp spacing, --hfit headline, plus extras), until `fits()`
 * passes. Reads real geometry, so it reacts to the actual rendered text.
 *
 * The ladder only ever touches spacing, the headline and template-chosen
 * regions; it never scales the whole composition.
 */
export function useAutoFit(
  rootRef: RefObject<HTMLElement | null>,
  ladder: readonly FitStep[],
  fits: (root: HTMLElement) => string | null,
  deps: readonly unknown[],
  onResult?: (r: FitResult) => void,
  /** Runs on each rung before the check (e.g. fitting the event title to the current column). */
  prepare?: (root: HTMLElement) => void,
): FitResult {
  const [result, setResult] = useState<FitResult>({ status: "fits", step: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [fontTick, setFontTick] = useState(0);

  // Text metrics change when the brand fonts finish loading: fit again then.
  useLayoutEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = (s: FitStep) => {
      root.style.setProperty("--sp", String(s.spacing));
      root.style.setProperty("--hfit", String(s.headline));
      for (const [k, v] of Object.entries(s.vars ?? {})) root.style.setProperty(k, v);
    };
    let next: FitResult = { status: "cannot-fit", step: ladder.length - 1 };
    for (let i = 0; i < ladder.length; i++) {
      apply(ladder[i]!);
      // Re-prepare on every rung: a rung can widen a column or step type down.
      prepare?.(root);
      const problem = fits(root);
      if (problem === null) {
        next = { status: i === 0 ? "fits" : "tightened", step: i };
        break;
      }
      if (i === ladder.length - 1) next = { status: "cannot-fit", step: i, reason: problem };
    }
    setResult((prev) => (prev.status === next.status && prev.step === next.step && prev.reason === next.reason ? prev : next));
    onResultRef.current?.(next);
  }, [...deps, fontTick]);

  return result;
}

/** True when an element's content is wider or taller than its box (by more than a pixel). */
export function overflows(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}
