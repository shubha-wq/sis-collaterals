import { EXPANSION_NEGATIVE_PROMPT, EXPANSION_PROMPT } from "../../src/expansion/prompt";
import { ProviderError, type ImageExpansionProvider, type ServerEnv } from "./provider";
import { stabilityProvider } from "./stability";

/**
 * POST /api/expand-image — the only server code in the app. Runs as a
 * Vercel function (api/expand-image.ts), a Netlify function
 * (netlify/functions/expand-image.mts) and Vite dev middleware.
 *
 * multipart/form-data: image (png/jpeg/webp ≤ 10 MB), left, right, up,
 * down (px of new background), outputWidth, outputHeight, instructions?,
 * negative?. Responds with the expanded image, or JSON
 * { error, message } with 400 (bad request), 405, 501 (not configured)
 * or 502 (provider failed). Never echoes credentials.
 */

/** Picks the provider from the environment; null when none is configured. */
export function selectProvider(env: ServerEnv): ImageExpansionProvider | null {
  const which = (env.IMAGE_EXPANSION_PROVIDER ?? (env.STABILITY_API_KEY ? "stability" : "")).trim().toLowerCase();
  if (which === "stability" && env.STABILITY_API_KEY) return stabilityProvider(env.STABILITY_API_KEY, { creativity: env.STABILITY_OUTPAINT_CREATIVITY });
  return null;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE_PX = 2000;
const MAX_OUTPUT_PX = 4096;
const json = (status: number, error: string, message: string) => new Response(JSON.stringify({ error, message }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleExpandImage(request: Request, env: ServerEnv, provider: ImageExpansionProvider | null = selectProvider(env)): Promise<Response> {
  if (request.method !== "POST") return json(405, "method-not-allowed", "Use POST.");
  if (!provider) return json(501, "not-configured", "AI background expansion isn't configured on this server.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, "bad-request", "Expected multipart form data.");
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) return json(400, "bad-request", "Missing image.");
  if (!/^image\/(png|jpeg|webp)$/.test(image.type)) return json(400, "bad-request", "The image must be PNG, JPEG or WebP.");
  if (image.size > MAX_BYTES) return json(400, "bad-request", "The image is too large.");
  const num = (k: string) => {
    const v = Number(form.get(k) ?? 0);
    return Number.isInteger(v) ? v : NaN;
  };
  const [left, right, up, down, outputWidth, outputHeight] = ["left", "right", "up", "down", "outputWidth", "outputHeight"].map(num) as [number, number, number, number, number, number];
  if ([left, right, up, down].some((v) => !(v >= 0 && v <= MAX_SIDE_PX))) return json(400, "bad-request", `Each expansion must be 0–${MAX_SIDE_PX}px.`);
  if (left + right + up + down === 0) return json(400, "bad-request", "Nothing to expand.");
  if (!(outputWidth > 0 && outputWidth <= MAX_OUTPUT_PX && outputHeight > 0 && outputHeight <= MAX_OUTPUT_PX)) return json(400, "bad-request", "Invalid output size.");
  const prompt = String(form.get("instructions") ?? "").slice(0, 4000) || EXPANSION_PROMPT;
  const negativePrompt = String(form.get("negative") ?? "").slice(0, 2000) || EXPANSION_NEGATIVE_PROMPT;
  try {
    const out = await provider.expand({ image: new Uint8Array(await image.arrayBuffer()), mime: image.type, left, right, up, down, outputWidth, outputHeight, prompt, negativePrompt });
    return new Response(out.image as unknown as ArrayBuffer, { status: 200, headers: { "content-type": out.mime, "x-expansion-provider": provider.name, "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 502;
    return json(status >= 400 && status < 600 ? status : 502, "provider-failed", e instanceof ProviderError ? e.message : "The image provider failed.");
  }
}
