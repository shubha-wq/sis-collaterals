import { ACCENTS } from "@/design-system/brand";
import { COLORS, luminance } from "@/design-system/tokens";
import type { Project } from "@/model/project";

/**
 * The solid colour that partner logos sit on, per template and state, or
 * null when they sit on a photo (unknown tone) or a mid-tone accent.
 * Used only to warn that a logo may disappear; never to add a plate.
 */
export function logoGroundHex(project: Project, typeOnly: boolean): string | null {
  const accent = ACCENTS[project.style.accent];
  switch (project.style.template) {
    case "broadsheet": {
      const g = project.overrides.paperGround ?? "paper";
      return COLORS[g === "accent" ? accent.token : g === "tint" ? accent.tint : "paper"];
    }
    case "poster":
      return typeOnly ? COLORS.ink : null;
    case "block":
      return typeOnly ? COLORS[accent.token] : null;
    case "slab":
      return typeOnly ? ((project.overrides.blockColour ?? "accent") === "accent" ? COLORS.ink : COLORS[accent.token]) : null;
    case "ticket":
      return typeOnly ? COLORS.paper : null;
  }
}

/** "dark" or "light" for grounds where a same-toned logo would vanish; otherwise null. */
export function groundTone(hex: string | null): "dark" | "light" | null {
  if (!hex) return null;
  const l = luminance(hex);
  if (l < 0.1) return "dark";
  if (l > 0.75) return "light";
  return null;
}
