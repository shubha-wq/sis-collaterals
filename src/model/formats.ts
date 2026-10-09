/** Output sizes. Every creative exports at exactly one of these. */
export type FormatId = "feed" | "banner";

export interface Format {
  id: FormatId;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const FORMATS: Record<FormatId, Format> = {
  feed: { id: "feed", label: "Feed", width: 1080, height: 1350, description: "1080 × 1350 · 4:5 feed post" },
  banner: { id: "banner", label: "Banner", width: 1600, height: 1000, description: "1600 × 1000 · 8:5 banner" },
};

export const DEFAULT_FORMAT: FormatId = "feed";
