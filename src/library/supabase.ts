import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BlobId } from "@/model/assets";
import type { OutputId } from "@/model/outputs";
import type { Project, TemplateId } from "@/model/project";
import { LibraryError, type CreativeFields, type CreativeRecord, type CreativeSummary, type CreativeVersionInfo, type LibraryBackend, type ListQuery, type SharedAssetStore } from "./types";

/**
 * Supabase implementation of the shared library (Postgres + Storage).
 * Schema and access rules: supabase/migrations/*_creative_library.sql.
 * Credentials come only from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY;
 * the anon key is public by design and row-level security (team members
 * only) protects the data.
 */

export const BUCKET = "creative-assets";
const SUMMARY = "id,version,created_at,updated_at,created_by,updated_by,output,template,headline,event_date,event_day,city,venue,thumbnail_path";

export interface CreativeRow {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  output: string;
  template: string | null;
  headline: string;
  event_date: string;
  event_day: string;
  city: string;
  venue: string;
  thumbnail_path: string | null;
  project?: Project;
}

export function rowToSummary(r: CreativeRow): CreativeSummary {
  return {
    id: r.id,
    version: r.version,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    output: r.output as OutputId,
    template: (r.template as TemplateId | null) ?? null,
    headline: r.headline ?? "",
    eventDate: r.event_date ?? "",
    eventDay: r.event_day ?? "",
    city: r.city ?? "",
    venue: r.venue ?? "",
    thumbnailPath: r.thumbnail_path,
  };
}

export function fieldsToRow(f: CreativeFields) {
  return { output: f.output, template: f.template, headline: f.headline, event_date: f.eventDate, event_day: f.eventDay, city: f.city, venue: f.venue, thumbnail_path: f.thumbnailPath };
}

type PgError = { code?: string; message?: string; status?: number } | null;

function fail(e: PgError, what: string): never {
  if (e?.code === "42501" || e?.status === 401 || e?.status === 403) {
    throw new LibraryError("unauthorised", "Your email isn't on the team list for the Creative Library. Ask an admin to add it.");
  }
  throw new LibraryError("unavailable", `The Creative Library couldn't ${what}. Check your connection and try again.`);
}

export class SupabaseLibraryBackend implements LibraryBackend {
  constructor(private readonly db: SupabaseClient) {}

  async list(q: ListQuery): Promise<CreativeSummary[]> {
    let query = this.db.from("creatives").select(SUMMARY).order("updated_at", { ascending: false }).limit(1000);
    if (q.since) query = query.gte("updated_at", q.since);
    const { data, error } = await query;
    if (error) fail(error, "load the list");
    return (data as unknown as CreativeRow[]).map(rowToSummary);
  }

  async get(id: string): Promise<CreativeRecord | null> {
    const { data, error } = await this.db.from("creatives").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "open this creative");
    if (!data) return null;
    const row = data as CreativeRow;
    return { ...rowToSummary(row), project: row.project! };
  }

  async insert(id: string, project: Project, fields: CreativeFields): Promise<CreativeSummary> {
    const { data, error } = await this.db.from("creatives").insert({ id, project, ...fieldsToRow(fields) }).select(SUMMARY).single();
    if (error?.code === "23505") throw new LibraryError("exists", "A creative with this id is already in the library.");
    if (error) fail(error, "save this creative");
    return rowToSummary(data as unknown as CreativeRow);
  }

  async update(id: string, expectedVersion: number, project: Project, fields: CreativeFields): Promise<CreativeSummary> {
    // One transaction on the server: archive the current version, then replace it if the version still matches.
    const { data, error } = await this.db.rpc("save_creative_changes", { p_id: id, p_expected_version: expectedVersion, p_project: project, p_fields: fieldsToRow(fields) });
    if (error?.message?.includes("not-found")) throw new LibraryError("not-found", "This creative is no longer in the library.");
    if (error) fail(error, "save your changes");
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as CreativeRow[];
    if (!rows.length) throw new LibraryError("conflict", "Someone else saved changes to this creative.");
    return rowToSummary(rows[0]!);
  }

  async listVersions(id: string): Promise<CreativeVersionInfo[]> {
    const { data, error } = await this.db.from("creative_versions").select("version,saved_at,saved_by,thumbnail_path").eq("creative_id", id).order("version", { ascending: false });
    if (error) fail(error, "load earlier versions");
    return (data as Array<{ version: number; saved_at: string; saved_by: string | null; thumbnail_path: string | null }>).map((v) => ({
      version: v.version,
      savedAt: new Date(v.saved_at).toISOString(),
      savedBy: v.saved_by,
      thumbnailPath: v.thumbnail_path,
    }));
  }

  async getVersion(id: string, version: number): Promise<Project | null> {
    const { data, error } = await this.db.from("creative_versions").select("project").eq("creative_id", id).eq("version", version).maybeSingle();
    if (error) fail(error, "open that version");
    return (data as { project: Project } | null)?.project ?? null;
  }
}

export class SupabaseSharedAssets implements SharedAssetStore {
  constructor(private readonly db: SupabaseClient) {}
  private get bucket() {
    return this.db.storage.from(BUCKET);
  }

  async hasBlob(id: BlobId): Promise<boolean> {
    const { data, error } = await this.bucket.list("blobs", { search: id, limit: 2 });
    if (error) fail(error as PgError, "check team files");
    return (data ?? []).some((o) => o.name === id);
  }

  async putBlob(id: BlobId, file: Blob): Promise<void> {
    const { error } = await this.bucket.upload(`blobs/${id}`, file, { upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "31536000" });
    // Content-addressed: if it's already there, it's the same file.
    if (error && !/exists|duplicate/i.test(error.message)) fail(error as PgError, "upload a file to team storage");
  }

  async getBlob(id: BlobId): Promise<Blob | null> {
    const { data, error } = await this.bucket.download(`blobs/${id}`);
    if (error) return null;
    return data;
  }

  async putThumbnail(path: string, file: Blob): Promise<void> {
    const { error } = await this.bucket.upload(path, file, { upsert: false, contentType: "image/jpeg" });
    if (error) fail(error as PgError, "store the preview");
  }

  async thumbnailUrl(path: string): Promise<string | null> {
    const { data } = await this.bucket.createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }
}

/** Email sign-in for the team (a one-time link; no passwords). Access is limited to the team_members list. */
export class SupabaseTeamAuth {
  constructor(private readonly db: SupabaseClient) {}

  async currentEmail(): Promise<string | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.email ?? null;
  }

  async sendSignInLink(email: string): Promise<void> {
    const { error } = await this.db.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: true } });
    if (error) throw new LibraryError("unavailable", "The sign-in link couldn't be sent. Check the address and try again.");
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  onChange(fn: (email: string | null) => void): () => void {
    const { data } = this.db.auth.onAuthStateChange((_event, session) => fn(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }
}

export function createSupabase(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });
}
