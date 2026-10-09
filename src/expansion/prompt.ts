/**
 * The outpainting instruction sent with every expansion. Server-side
 * providers receive it as the prompt (plus a negative prompt where the
 * provider supports one). Kept in one place so it is reviewed and versioned
 * with EXPANSION_VERSION.
 */
export const EXPANSION_PROMPT = [
  "Expand this portrait photograph into a landscape composition by extending the existing background horizontally.",
  "Keep the original photograph and all original subjects completely unchanged.",
  "Do not crop, stretch, retouch, regenerate, replace, or modify any person or existing object.",
  "Keep every person's face, body, clothing, pose, proportions, position, expression, lighting and photographic detail identical to the source image.",
  "Generate ONLY the additional background required on the left and right sides.",
  "Continue the existing environment naturally and seamlessly, matching the original background, perspective, depth of field, lighting, shadows, colours, textures, lens characteristics and photographic quality.",
  "The expanded areas should look as though the original photograph was naturally captured in a wider landscape frame.",
  "Do not introduce new people, duplicate objects, artificial patterns, visible seams, or AI-generated-looking details.",
].join(" ");

/** For a panorama the free space is above and below instead. */
export function expansionPrompt(axis: "x" | "y"): string {
  return axis === "x"
    ? EXPANSION_PROMPT
    : EXPANSION_PROMPT.replace("extending the existing background horizontally", "extending the existing background vertically").replace("on the left and right sides", "above and below").replace("into a landscape composition", "into a taller composition");
}

export const EXPANSION_NEGATIVE_PROMPT =
  "new people, extra people, duplicated people, duplicated objects, extra limbs, extra fingers, distorted faces, changed faces, altered clothing, text, watermark, logo, frame, border, visible seam, mirrored background, repeated pattern, blur, cartoon, illustration, painting, CGI";
