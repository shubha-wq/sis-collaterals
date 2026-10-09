import { TEXT_COLOURS } from "@/design-system/brand";
import { COLORS } from "@/design-system/tokens";
import type { Project, TextRole } from "@/model/project";
import { MIN_TEXT_CONTRAST, measureTextContrast } from "@/templates/shared/contrast";
import type { CheckResult } from "./layoutChecks";

const rgb = (hex: string) => `rgb(${[0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16)).join(", ")})`;

/**
 * Text colour checks on a rendered creative: every block with a chosen
 * colour shows exactly that colour; blocks without one are not marked as
 * overridden (no cross-contamination); expected low-contrast blocks are
 * flagged by the same measurement the editor's Review uses.
 */
export function runTextColourChecks(root: HTMLElement, project: Project, expectLow: readonly TextRole[] = []): CheckResult[] {
  const out: CheckResult[] = [];
  const set = project.textColours ?? {};
  const roles = Object.keys(set) as TextRole[];
  if (roles.length) {
    const wrong: string[] = [];
    for (const role of roles) {
      const want = rgb(COLORS[TEXT_COLOURS[set[role]!].token!]);
      for (const el of root.querySelectorAll<HTMLElement>(`[data-text-role="${role}"]`)) {
        const got = getComputedStyle(el).color;
        if (got !== want) wrong.push(`${role} ${got}≠${want}`);
      }
    }
    out.push({ name: "text colours applied", pass: wrong.length === 0, detail: wrong.join("; ") });
  }
  const leaked = [...root.querySelectorAll<HTMLElement>('[data-text-override="true"]')].filter((el) => !set[el.dataset.textRole as TextRole]);
  out.push({ name: "no colour leaks to other blocks", pass: leaked.length === 0, detail: leaked.map((e) => e.dataset.textRole).join(", ") });
  if (expectLow.length) {
    const readings = measureTextContrast(root);
    const missed = expectLow.filter((r) => !readings.some((x) => x.role === r && x.ratio < MIN_TEXT_CONTRAST));
    out.push({ name: "low contrast flagged", pass: missed.length === 0, detail: readings.map((x) => `${x.role} ${x.ratio}:1`).join(", ") || "no readings" });
  }
  return out;
}
