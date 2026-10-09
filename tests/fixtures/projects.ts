import { createBlankProject } from "@/model/blank";
import type { Project } from "@/model/project";

/**
 * Test-only example content. Never imported by src/: the real editor always
 * starts blank (see docs/ARCHITECTURE.md, "Projects, sessions and drafts").
 */
export function exampleProject(id = "example", now = new Date("2026-10-06T00:00:00Z")): Project {
  const p = createBlankProject(id, now);
  return {
    ...p,
    content: { ...p.content, headline: "Padel\nCoaching\nWorkshop", date: "10th October", day: "Saturday", time: "4:00–7:00 PM", venue: "Hive Club", city: "Bangalore" },
    photo: { source: { kind: "builtin", id: "padel-hive-club" }, focusX: 48, focusY: 42, zoom: 1 },
    logos: { partners: [{ id: "p1", source: { kind: "builtin", id: "nike" } }], background: "none" },
  };
}
