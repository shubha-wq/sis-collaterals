/**
 * Server-side image expansion ("outpainting"). Providers are swappable:
 * implement ImageExpansionProvider and register it in selectProvider().
 * Credentials come from server environment variables only.
 */
export interface ExpansionInput {
  image: Uint8Array;
  mime: string;
  left: number;
  right: number;
  up: number;
  down: number;
  outputWidth: number;
  outputHeight: number;
  prompt: string;
  negativePrompt: string;
}

export interface ExpansionOutput {
  image: Uint8Array;
  mime: string;
}

export interface ImageExpansionProvider {
  readonly name: string;
  expand(input: ExpansionInput): Promise<ExpansionOutput>;
}

/** A provider failure with a message safe to show (never includes credentials). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ServerEnv = Record<string, string | undefined>;
