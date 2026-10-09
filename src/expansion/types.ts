/**
 * Client-side contract for AI background expansion. The browser never
 * holds a provider key: the default implementation posts to the app's own
 * server endpoint (/api/expand-image), which calls the configured provider.
 */
export interface ExpansionRequest {
  /** The photo at its placed size (a resampled copy; the original file is untouched). */
  image: Blob;
  left: number;
  right: number;
  up: number;
  down: number;
  /** Expected size of the result: photo plus the new background. */
  outputWidth: number;
  outputHeight: number;
  instructions: string;
  negative: string;
}

export interface ExpansionResult {
  image: Blob;
  provider: string;
}

export interface ExpansionService {
  expand(req: ExpansionRequest): Promise<ExpansionResult>;
}

export type ExpansionErrorCode = "not-configured" | "failed" | "invalid-result";

export class ExpansionError extends Error {
  readonly code: ExpansionErrorCode;
  constructor(code: ExpansionErrorCode, message: string) {
    super(message);
    this.name = "ExpansionError";
    this.code = code;
  }
}

export type ExpansionStatus =
  | { state: "idle" }
  | { state: "generating" }
  | { state: "ready" }
  | { state: "failed"; message: string }
  /** No provider is configured: the website outputs fall back to the soft edge fill. */
  | { state: "unavailable"; message: string };
