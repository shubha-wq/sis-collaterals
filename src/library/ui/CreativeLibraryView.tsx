import { useEffect, useMemo, useState } from "react";
import { Button } from "@/design-system/components/Button";
import { OUTPUTS, OUTPUT_ORDER, type OutputId } from "@/model/outputs";
import type { TemplateId } from "@/model/project";
import { AVAILABLE_TEMPLATES, findTemplate } from "@/templates/registry";
import type { CreativeLibrary } from "../service";
import { EMPTY_FILTERS, RANGE_LABELS, citiesIn, filterCreatives, groupByDay, type DateRange, type LibraryFilters } from "../filter";
import { LibraryError, type CreativeSummary, type CreativeVersionInfo } from "../types";
import type { LibraryState } from "./useLibrary";

const dayHeading = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const short = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * The shared Creative Library: the team's saved creatives, newest first,
 * last 30 days by default (older ones are kept; pick a longer range to see
 * them). Search and a few filters; each creative opens for editing.
 */
export function CreativeLibraryView({ lib, onClose, onOpen }: { lib: LibraryState; onClose: () => void; onOpen: (id: string, version?: number) => void }) {
  const conn = lib.connection;
  return (
    <div className="library-view" role="dialog" aria-modal="true" aria-labelledby="library-title">
      <header className="library-head">
        <div className="library-head-text">
          <h1 id="library-title">Creative Library</h1>
          <p className="muted">The team's saved creatives, fully editable. Open one to change it and download it again. Drafts stay in this browser; the library is shared.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Back to editor
        </Button>
      </header>
      {!conn && <p className="muted">Connecting…</p>}
      {conn?.kind === "not-configured" && <NotConfigured />}
      {conn?.kind === "shared" && !lib.email && <SignIn send={(e) => conn.auth.sendSignInLink(e)} />}
      {conn?.kind === "preview" && (
        <p className="library-notice" role="note">
          Development preview: this library lives in this tab only and isn't shared. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the shared library.
        </p>
      )}
      {conn && conn.kind !== "not-configured" && lib.email && (
        <>
          {conn.kind === "shared" && (
            <p className="muted library-signed-in">
              Signed in as {lib.email} ·{" "}
              <button type="button" className="link-button" onClick={() => void conn.auth.signOut()}>
                Sign out
              </button>
            </p>
          )}
          <LibraryList library={conn.library} onOpen={onOpen} />
        </>
      )}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="library-notice" role="note">
      <strong>The Creative Library isn't set up yet.</strong>
      <p>It needs a Supabase project. An admin runs the SQL in supabase/migrations, adds the team's email addresses, and sets VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this site. See docs/CREATIVE_LIBRARY.md.</p>
      <p>Everything else, including Drafts in this browser, works as before.</p>
    </div>
  );
}

function SignIn({ send }: { send: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <form
      className="library-signin"
      onSubmit={(e) => {
        e.preventDefault();
        setState("sending");
        send(email).then(
          () => setState("sent"),
          () => setState("error"),
        );
      }}
    >
      <label className="field-label" htmlFor="library-email">
        Sign in with your team email
      </label>
      <div className="library-signin-row">
        <input id="library-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button variant="primary" size="sm" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send sign-in link"}
        </Button>
      </div>
      <p className="field-hint" role="status">
        {state === "sent" ? "Check your email and open the link in this browser." : state === "error" ? "The link couldn't be sent. Check the address and try again." : "No password: we email you a one-time link. Only addresses on the team list can open the library."}
      </p>
    </form>
  );
}

function LibraryList({ library, onOpen }: { library: CreativeLibrary; onOpen: (id: string, version?: number) => void }) {
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [items, setItems] = useState<CreativeSummary[] | null>(null);
  const [error, setError] = useState("");
  const set = <K extends keyof LibraryFilters>(k: K, v: LibraryFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let live = true;
    setItems(null);
    setError("");
    library.list(filters.range).then(
      (list) => live && setItems(list),
      (e: unknown) => live && setError(e instanceof LibraryError ? e.message : "The Creative Library couldn't be loaded. Try again."),
    );
    return () => {
      live = false;
    };
  }, [library, filters.range]);

  const shown = useMemo(() => (items ? filterCreatives(items, filters) : []), [items, filters]);
  const cities = useMemo(() => citiesIn(items ?? []), [items]);
  const groups = groupByDay(shown);

  return (
    <section className="library-body" aria-label="Saved creatives">
      <div className="library-filters">
        <input className="input library-search" type="search" placeholder="Search headline, venue or city" aria-label="Search headline, venue or city" value={filters.search} onChange={(e) => set("search", e.target.value)} />
        <select className="input" aria-label="City" value={filters.city} onChange={(e) => set("city", e.target.value)}>
          <option value="all">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Output type" value={filters.output} onChange={(e) => set("output", e.target.value as OutputId | "all")}>
          <option value="all">All outputs</option>
          {OUTPUT_ORDER.map((o) => (
            <option key={o} value={o}>
              {OUTPUTS[o].label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Template" value={filters.template} onChange={(e) => set("template", e.target.value as TemplateId | "all")}>
          <option value="all">All templates</option>
          {AVAILABLE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} (Instagram)
            </option>
          ))}
        </select>
        <select className="input" aria-label="Date range" value={filters.range} onChange={(e) => set("range", e.target.value as DateRange)}>
          {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <p className="field-hint">
        {filters.range === "all" ? "Showing every saved creative." : `Showing creatives saved in the ${RANGE_LABELS[filters.range].toLowerCase()}. Older ones are kept; choose All time to see them.`}
      </p>
      {error && (
        <p className="library-bar-error" role="alert">
          {error}
        </p>
      )}
      {!items && !error && <p className="muted">Loading…</p>}
      {items && shown.length === 0 && <p className="muted">{items.length === 0 ? "Nothing saved in this period yet. Use Save to Library in the editor." : "No creatives match. Try a different search or filter."}</p>}
      {groups.map((g) => (
        <section key={g.day} className="library-day" aria-label={dayHeading(g.items[0]!.updatedAt)}>
          <h2 className="library-day-title">{dayHeading(g.items[0]!.updatedAt)}</h2>
          <div className="library-grid">
            {g.items.map((c) => (
              <LibraryCard key={c.id} c={c} library={library} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function LibraryCard({ c, library, onOpen }: { c: CreativeSummary; library: CreativeLibrary; onOpen: (id: string, version?: number) => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [versions, setVersions] = useState<CreativeVersionInfo[] | null>(null);
  useEffect(() => {
    let live = true;
    if (c.thumbnailPath) void library.thumbnailUrl(c.thumbnailPath).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [c.thumbnailPath, library]);

  const kind = c.output === "instagram" ? `${OUTPUTS.instagram.label} · ${c.template ? findTemplate(c.template).label : ""}` : OUTPUTS[c.output].label;
  const event = [c.city, [c.eventDate, c.eventDay].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  return (
    <article className="library-card" data-creative={c.id}>
      <div className="library-thumb" data-output={c.output}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="muted">No preview</span>}
      </div>
      <div className="library-card-text">
        <strong className="library-card-title">{c.headline || "Untitled creative"}</strong>
        {event && <span>{event}</span>}
        {c.venue && <span className="muted">{c.venue}</span>}
        <span className="library-card-kind">{kind}</span>
        <span className="muted library-card-dates">
          Created {short(c.createdAt)} · Last edited {short(c.updatedAt)}
          {c.updatedBy ? ` by ${c.updatedBy}` : ""}
          {c.version > 1 ? ` · version ${c.version}` : ""}
        </span>
      </div>
      <div className="library-card-actions">
        <Button variant="primary" size="sm" onClick={() => onOpen(c.id)}>
          Open / Edit
        </Button>
        {c.version > 1 && (
          <Button variant="ghost" size="sm" aria-expanded={!!versions} onClick={() => (versions ? setVersions(null) : void library.versions(c.id).then(setVersions))}>
            Earlier versions
          </Button>
        )}
      </div>
      {versions && (
        <ul className="library-versions">
          {versions.map((v) => (
            <li key={v.version}>
              <span>
                Version {v.version} · {short(v.savedAt)}
                {v.savedBy ? ` · ${v.savedBy}` : ""}
              </span>
              <button type="button" className="link-button" onClick={() => onOpen(c.id, v.version)}>
                Open this version
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
