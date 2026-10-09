import { TEXT_COLOURS } from "@/design-system/brand";
import { color } from "@/design-system/tokens";
import type { Project, TextRole } from "@/model/project";

/**
 * Per-block text colour. Every text block in every template asks for its
 * colour by semantic role, passing the colour the template would use. A
 * block's own override wins; otherwise the template's colour stands (which
 * already includes the Fine-tune "All text" colour). Roles never share
 * state: overriding one block can't change another.
 */
export interface TextPaint {
  color(role: TextRole, fallback: string): string;
  /** Marks the element with its role (and whether it is overridden) for QA and the contrast check. */
  attrs(role: TextRole): TextAttrs;
}

export interface TextAttrs {
  "data-text-role": TextRole;
  "data-text-override"?: "true";
}

export function makePaint(project: Pick<Project, "textColours">): TextPaint {
  const set = project.textColours ?? {};
  return {
    color(role, fallback) {
      const choice = set[role];
      const token = choice ? TEXT_COLOURS[choice]?.token : null;
      return token ? color(token) : fallback;
    },
    attrs(role) {
      return set[role] ? { "data-text-role": role, "data-text-override": "true" } : { "data-text-role": role };
    },
  };
}

/** A paint with no overrides (templates' own colours). */
export const DEFAULT_PAINT: TextPaint = makePaint({});
