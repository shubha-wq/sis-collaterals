import type { ComponentType } from "react";
import type { DetailStyle, TemplateId } from "@/model/project";
import { Block } from "./block/Block";
import { Broadsheet } from "./broadsheet/Broadsheet";
import { Poster } from "./poster/Poster";
import { Slab } from "./slab/Slab";
import { Ticket } from "./ticket/Ticket";
import type { TemplateProps } from "./types";

/**
 * Template catalogue. Each template has exactly one detail treatment, matched
 * to its design; there is no user-facing detail-style selector.
 */
export interface TemplateInfo {
  id: TemplateId;
  label: string;
  description: string;
  recommendedDetailStyle: DetailStyle;
  /** Detail styles for this template. Always one: fixed, shown read-only. */
  detailStyles: readonly DetailStyle[];
  /** One line for the Details section, in plain words. */
  detailsDescription: string;
  component: ComponentType<TemplateProps> | null;
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: "broadsheet", label: "Broadsheet", description: "Editorial page: headline, inset photo, ledger", recommendedDetailStyle: "ledger", detailStyles: ["ledger"], detailsDescription: "The date is set large, with the time and venue beside it.", component: Broadsheet },
  { id: "poster", label: "Poster", description: "Full-bleed photo, type on a dark fade", recommendedDetailStyle: "inline", detailStyles: ["inline"], detailsDescription: "Date, time and venue run in one line, separated by dots.", component: Poster },
  { id: "block", label: "Block", description: "Photo and a colour panel", recommendedDetailStyle: "cards", detailStyles: ["cards"], detailsDescription: "Date, time and venue sit on small cards.", component: Block },
  { id: "slab", label: "Slab", description: "Colour slab on a full-bleed photo", recommendedDetailStyle: "rows", detailStyles: ["rows"], detailsDescription: "Date, time and venue are listed as labelled rows.", component: Slab },
  { id: "ticket", label: "Ticket", description: "Photo and a perforated stub", recommendedDetailStyle: "tags", detailStyles: ["tags"], detailsDescription: "Date, time and venue are solid colour tags.", component: Ticket },
];

/** Templates people can use now. Unbuilt ones are not shown at all. */
export const AVAILABLE_TEMPLATES = TEMPLATES.filter((t) => t.component !== null);

export function findTemplate(id: TemplateId): TemplateInfo {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === "block")!;
}
