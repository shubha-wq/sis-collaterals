import { ProviderError, type ExpansionInput, type ExpansionOutput, type ImageExpansionProvider } from "./provider";

/**
 * Stability AI "Outpaint" (Stable Image Edit API). Sends the photo and how
 * many pixels to add on each side; the service returns the original with
 * only the new area generated. Docs: platform.stability.ai → Edit → Outpaint.
 *
 * Env: STABILITY_API_KEY (required), STABILITY_OUTPAINT_CREATIVITY
 * (optional, 0–1, default 0.35: lower stays closer to the photo).
 */
export const STABILITY_OUTPAINT_URL = "https://api.stability.ai/v2beta/stable-image/edit/outpaint";
/** The API's limit per side. */
export const STABILITY_MAX_SIDE = 2000;

export function stabilityProvider(apiKey: string, opts: { creativity?: string; fetchImpl?: typeof fetch } = {}): ImageExpansionProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    name: "stability-outpaint",
    async expand(input: ExpansionInput): Promise<ExpansionOutput> {
      for (const side of [input.left, input.right, input.up, input.down]) {
        if (side > STABILITY_MAX_SIDE) throw new ProviderError(`Expansion of ${side}px exceeds the provider's ${STABILITY_MAX_SIDE}px limit.`, 400);
      }
      const fd = new FormData();
      fd.append("image", new Blob([input.image as unknown as ArrayBuffer], { type: input.mime }), "photo.png");
      for (const k of ["left", "right", "up", "down"] as const) if (input[k] > 0) fd.append(k, String(input[k]));
      // Outpaint takes a single prompt; the things to avoid are stated in it.
      fd.append("prompt", `${input.prompt} Avoid: ${input.negativePrompt}.`);
      fd.append("creativity", opts.creativity ?? "0.35");
      fd.append("output_format", "jpeg");
      let res: Response;
      try {
        res = await fetchImpl(STABILITY_OUTPAINT_URL, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, accept: "image/*" }, body: fd });
      } catch {
        throw new ProviderError("The image provider couldn't be reached.");
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300).replaceAll(apiKey, "***");
        throw new ProviderError(res.status === 401 || res.status === 403 ? "The image provider rejected the server's credentials." : `The image provider returned an error (${res.status}). ${detail}`.trim());
      }
      return { image: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "image/jpeg" };
    },
  };
}
