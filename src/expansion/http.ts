import { ExpansionError, type ExpansionRequest, type ExpansionResult, type ExpansionService } from "./types";

/** Longest the browser waits for a landscape (providers usually answer in 5–30 s). */
const TIMEOUT_MS = 90_000;

/** Default client: posts to the app's server endpoint. No key ever reaches the browser. */
export class HttpExpansionService implements ExpansionService {
  constructor(
    private readonly endpoint = "/api/expand-image",
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    /** Checks the returned image's size (browser: decode). Tests can stub it. */
    private readonly sizeOf: (b: Blob) => Promise<{ width: number; height: number }> = browserImageSize,
  ) {}

  async expand(req: ExpansionRequest): Promise<ExpansionResult> {
    const fd = new FormData();
    fd.append("image", req.image, "photo.png");
    for (const k of ["left", "right", "up", "down", "outputWidth", "outputHeight"] as const) fd.append(k, String(req[k]));
    fd.append("instructions", req.instructions);
    fd.append("negative", req.negative);
    let res: Response;
    // Generation can take a while, but never hang the editor: give up after TIMEOUT_MS.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", body: fd, signal: abort.signal });
    } catch {
      throw new ExpansionError("failed", abort.signal.aborted ? "The image service took too long. Try again." : "Couldn't reach the image service. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 501 || res.status === 404) throw new ExpansionError("not-configured", "AI background expansion isn't set up for this site.");
    if (!res.ok) {
      const msg = await res.json().then((j: { message?: string }) => j.message, () => undefined);
      throw new ExpansionError("failed", msg ?? "The image service couldn't generate the landscape. Try again.");
    }
    const image = await res.blob();
    const size = await this.sizeOf(image);
    // Uniform scale only: a result with a different shape is rejected, never stretched.
    if (Math.abs(size.width / size.height - req.outputWidth / req.outputHeight) > 0.01) {
      throw new ExpansionError("invalid-result", "The generated landscape came back the wrong shape. Try again.");
    }
    return { image, provider: res.headers.get("x-expansion-provider") ?? "unknown" };
  }
}

async function browserImageSize(b: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(b);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

/** Resamples the source photo to the placed size as PNG (a copy for the request; the source is never touched). */
export async function preparePhoto(sourceUrl: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error("photo failed to load"));
    img.src = sourceUrl;
  });
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) throw new Error("photo could not be prepared");
  return blob;
}
