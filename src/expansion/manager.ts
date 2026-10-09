import type { ImageSource } from "@/model/assets";
import type { ExpansionRecord } from "@/model/project";
import type { BlobStore } from "@/persistence/types";
import { EXPANSION_NEGATIVE_PROMPT, expansionPrompt } from "./prompt";
import { expansionKey, type ExpansionSpec } from "./spec";
import { ExpansionError, type ExpansionService, type ExpansionStatus } from "./types";

export interface ExpansionManagerDeps {
  service: ExpansionService;
  /** This browser's blob store: the generated landscape is kept there, like an upload. */
  blobs: BlobStore;
  /** Resamples the source photo to the placed size (browser canvas); never modifies the source. */
  prepare: (sourceUrl: string, width: number, height: number) => Promise<Blob>;
  now?: () => Date;
}

export interface EnsureArgs {
  source: ImageSource;
  sourceUrl: string;
  spec: ExpansionSpec;
  /** The derivative the project already has, if any. */
  current?: ExpansionRecord;
}

/**
 * Generates and caches the AI landscape for a source photo.
 * - One request per key at a time (Listing and Banner share it).
 * - Reuses the project's existing derivative when its key matches and the
 *   file is present, so switching outputs, editing text or logos, moving the
 *   focus, or reopening a saved creative never regenerates.
 * - A failure is remembered until retry(); "not configured" is remembered for
 *   the session (the fallback is used, and nothing is retried in a loop).
 */
export class ExpansionManager {
  private statuses = new Map<string, ExpansionStatus>();
  private inflight = new Map<string, Promise<ExpansionRecord | null>>();
  private listeners = new Set<() => void>();
  private unavailable: string | null = null;
  /** Keys requested from the service, in order (for tests and diagnostics). */
  readonly calls: string[] = [];
  /** Changes whenever any status changes (for React subscriptions). */
  version = 0;

  constructor(private readonly deps: ExpansionManagerDeps) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  status(key: string): ExpansionStatus {
    if (this.unavailable) return { state: "unavailable", message: this.unavailable };
    return this.statuses.get(key) ?? { state: "idle" };
  }

  private set(key: string, s: ExpansionStatus) {
    this.statuses.set(key, s);
    this.notify();
  }

  private notify() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  async ensure(args: EnsureArgs): Promise<ExpansionRecord | null> {
    const key = expansionKey(args.source, args.spec);
    if (args.current?.key === key && (await this.deps.blobs.has(args.current.blobId))) {
      if (this.status(key).state !== "ready") this.set(key, { state: "ready" });
      return args.current;
    }
    const st = this.status(key);
    if (st.state === "failed" || st.state === "unavailable") return null;
    const running = this.inflight.get(key);
    if (running) return running;
    const job = this.generate(key, args).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  /** Clears a failure and tries again. */
  retry(args: EnsureArgs): Promise<ExpansionRecord | null> {
    const key = expansionKey(args.source, args.spec);
    this.statuses.delete(key);
    return this.ensure(args);
  }

  private async generate(key: string, { sourceUrl, spec }: EnsureArgs): Promise<ExpansionRecord | null> {
    this.set(key, { state: "generating" });
    this.calls.push(key);
    try {
      const image = await this.deps.prepare(sourceUrl, spec.photoW, spec.photoH);
      const res = await this.deps.service.expand({
        image,
        left: spec.left,
        right: spec.right,
        up: spec.up,
        down: spec.down,
        outputWidth: spec.masterW,
        outputHeight: spec.masterH,
        instructions: expansionPrompt(spec.axis),
        negative: EXPANSION_NEGATIVE_PROMPT,
      });
      const blobId = await this.deps.blobs.put(res.image);
      const record: ExpansionRecord = {
        key,
        blobId,
        masterW: spec.masterW,
        masterH: spec.masterH,
        photoX: spec.photoX,
        photoY: spec.photoY,
        photoW: spec.photoW,
        photoH: spec.photoH,
        provider: res.provider,
        createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      };
      this.set(key, { state: "ready" });
      return record;
    } catch (e) {
      if (e instanceof ExpansionError && e.code === "not-configured") {
        this.unavailable = e.message;
        this.notify();
      } else {
        this.set(key, { state: "failed", message: e instanceof Error ? e.message : "The landscape couldn't be generated." });
      }
      return null;
    }
  }
}
