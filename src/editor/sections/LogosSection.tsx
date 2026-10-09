import { useCallback, useEffect, useState } from "react";
import { BUILTIN_PARTNER_LOGOS } from "@/assets/catalog";
import { LOGO_ACCEPT } from "@/assets/logoFiles";
import { LOGO_BACKGROUNDS } from "@/design-system/brand";
import type { ImageSource } from "@/model/assets";
import { MAX_PARTNER_LOGOS, type LogoBackground, type LogoSettings, type PartnerLogo } from "@/model/project";
import { LogoUploadError, type LogoLibrary, type LogoRecord } from "@/persistence/types";
import { LOGO_LIBRARY_HELP, requestPersistentStorage } from "@/persistence/storageStatus";
import type { Edit } from "@/state/edits";
import { assessLogo } from "@/validation/logoChecks";
import type { Issue } from "@/validation/types";
import { ConfirmDialog } from "../ConfirmDialog";
import { Field, PanelSection } from "../PanelSection";

/** Show a search box in "Manage your logos" once the library is longer than this. */
const SEARCH_FROM = 8;

export function logosSummary(logos: LogoSettings): string {
  const n = logos.partners.length;
  const parts = ["SIS"];
  if (n) parts.push(n === 1 ? "1 partner" : `${n} partners`);
  const bg = logos.background === "none" ? "" : ` · ${LOGO_BACKGROUNDS[logos.background].label} background`;
  return parts.join(" + ") + bg;
}

const keyOf = (s: ImageSource) => (s.kind === "builtin" ? `b:${s.id}` : `u:${s.blobId}`);

interface LogosSectionProps {
  logos: LogoSettings;
  edit: (e: Edit) => void;
  library: LogoLibrary | null;
  open: boolean;
  onToggle: () => void;
}

interface Choice {
  key: string;
  label: string;
  source: ImageSource;
}

/**
 * SIS is always on. Partner logos are chosen with one dropdown per slot
 * (up to four): Nike and this browser's saved logos. Uploading saves to the
 * logo library and fills the next empty slot. No thumbnails in the panel;
 * the creative itself is the preview.
 */
export function LogosSection({ logos, edit, library, open, onToggle }: LogosSectionProps) {
  const [saved, setSaved] = useState<LogoRecord[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const refresh = useCallback(async () => setSaved(library ? await library.listLogos() : []), [library]);
  useEffect(() => void refresh(), [refresh]);

  const partners = logos.partners;
  const recordSource = (r: LogoRecord): ImageSource => ({ kind: "upload", blobId: r.blobId, libraryId: r.id, name: r.name });
  const newLogo = (source: ImageSource): PartnerLogo => ({ id: `${keyOf(source).replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${Date.now().toString(36)}`, source });

  // Everything that can go in a slot: Nike, your saved logos, and any logo
  // already on this creative that isn't in this browser's library (e.g. a
  // creative opened from the Creative Library).
  const builtins: Choice[] = BUILTIN_PARTNER_LOGOS.map((l) => ({ key: `b:${l.id}`, label: l.label, source: { kind: "builtin", id: l.id } }));
  const yours: Choice[] = saved.map((r) => ({ key: `u:${r.blobId}`, label: r.name, source: recordSource(r) }));
  const known = new Set([...builtins, ...yours].map((c) => c.key));
  const onCreative: Choice[] = partners.filter((p) => !known.has(keyOf(p.source))).map((p) => ({ key: keyOf(p.source), label: p.source.kind === "upload" ? p.source.name : p.source.id, source: p.source }));
  const all = [...builtins, ...yours, ...onCreative];
  const byKey = new Map(all.map((c) => [c.key, c]));

  const choose = (slot: number, key: string) => {
    const current = partners[slot];
    if (!key) {
      if (current) edit({ type: "remove-partner", id: current.id });
      return;
    }
    const c = byKey.get(key);
    if (!c) return;
    if (current) edit({ type: "replace-partner", id: current.id, logo: newLogo(c.source) });
    else edit({ type: "add-partner", logo: newLogo(c.source) });
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || !library) return;
    const next: Issue[] = [];
    let room = MAX_PARTNER_LOGOS - partners.length;
    const used = new Set(partners.map((p) => keyOf(p.source)));
    for (const f of Array.from(files)) {
      try {
        const r = await library.addLogo(f);
        next.push(...assessLogo(r.meta, r.name));
        if (used.has(`u:${r.blobId}`)) continue;
        if (room > 0) {
          edit({ type: "add-partner", logo: newLogo(recordSource(r)) });
          used.add(`u:${r.blobId}`);
          room -= 1;
        } else {
          next.push({ id: "full-" + r.id, level: "warning", message: `${r.name} is saved in your logos. This creative already has ${MAX_PARTNER_LOGOS} partner logos.` });
        }
      } catch (e) {
        next.push({ id: "err-" + f.name, level: "blocking", message: e instanceof LogoUploadError ? `${f.name}: ${e.message}` : `${f.name} couldn't be added.` });
      }
    }
    setIssues(next);
    void requestPersistentStorage();
    await refresh();
  };

  // Show the filled slots, then one empty slot to add the next logo (up to four).
  const slots = Math.min(MAX_PARTNER_LOGOS, partners.length + 1);
  return (
    <PanelSection title="Logos" summary={logosSummary(logos)} open={open} onToggle={onToggle}>
      <p className="field-hint">Sisters in Sweat is always included.</p>
      {Array.from({ length: slots }, (_, i) => {
        const current = partners[i];
        const value = current ? keyOf(current.source) : "";
        const taken = new Set(partners.filter((_, j) => j !== i).map((p) => keyOf(p.source)));
        const option = (c: Choice) => (
          <option key={c.key} value={c.key} disabled={taken.has(c.key)}>
            {c.label}
            {taken.has(c.key) ? " (already added)" : ""}
          </option>
        );
        return (
          <Field key={current?.id ?? `empty-${i}`} label={`Partner ${i + 1}`} htmlFor={`field-partner-${i}`}>
            <select id={`field-partner-${i}`} className="input" value={value} onChange={(e) => choose(i, e.target.value)}>
              <option value="">{current ? "None (remove)" : "Select logo"}</option>
              <optgroup label="Built in">{builtins.map(option)}</optgroup>
              {yours.length > 0 && <optgroup label="Your logos">{yours.map(option)}</optgroup>}
              {onCreative.length > 0 && <optgroup label="On this creative">{onCreative.map(option)}</optgroup>}
            </select>
          </Field>
        );
      })}
      {partners.length >= MAX_PARTNER_LOGOS && <p className="field-hint">This creative has the maximum of {MAX_PARTNER_LOGOS} partner logos.</p>}

      <label className="upload">
        <span>+ Upload a logo</span>
        <input id="field-logo-upload" type="file" accept={LOGO_ACCEPT} multiple aria-label="Upload a logo" onChange={(e) => { void onUpload(e.target.files); e.target.value = ""; }} />
      </label>
      {issues.map((i) => (
        <p key={i.id} className={i.level === "blocking" ? "field-error" : "field-hint field-hint--warn"}>
          {i.message}
        </p>
      ))}

      <p className="label">Logo background</p>
      <div className="chips">
        {(Object.keys(LOGO_BACKGROUNDS) as LogoBackground[]).map((b) => (
          <button key={b} type="button" className="chip" aria-pressed={logos.background === b} onClick={() => edit({ type: "logo-background", background: b })}>
            {LOGO_BACKGROUNDS[b].label}
          </button>
        ))}
      </div>

      {saved.length > 0 && <ManageLogos saved={saved} library={library} refresh={refresh} />}
      <p className="field-hint">{LOGO_LIBRARY_HELP}</p>
    </PanelSection>
  );
}

/** Rename or delete saved logos: a compact, collapsed list of names (no thumbnails). */
function ManageLogos({ saved, library, refresh }: { saved: LogoRecord[]; library: LogoLibrary | null; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<LogoRecord | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? saved.filter((r) => r.name.toLowerCase().includes(q)) : saved;

  const rename = async (r: LogoRecord, name: string) => {
    setRenaming(null);
    if (!library || !name.trim() || name.trim() === r.name) return;
    await library.renameLogo(r.id, name);
    await refresh();
  };

  return (
    <details className="manage-logos">
      <summary>Manage your logos ({saved.length})</summary>
      {saved.length > SEARCH_FROM && (
        <input id="field-logo-search" className="input" type="search" placeholder="Search your logos" aria-label="Search your logos" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {q && shown.length === 0 && <p className="field-hint">No logos match “{query}”.</p>}
      {shown.map((r) => (
        <div key={r.id} className="logo-item">
          {renaming === r.id ? (
            <input
              id={`field-rename-${r.id}`}
              className="input input--inline"
              aria-label={`New name for ${r.name}`}
              defaultValue={r.name}
              autoFocus
              onBlur={(e) => void rename(r, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void rename(r, e.currentTarget.value);
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span className="logo-item-name" title={r.name}>
              {r.name}
            </span>
          )}
          <button type="button" className="link-btn" onClick={() => setRenaming(r.id)}>
            Rename
          </button>
          <button type="button" className="link-btn" onClick={() => setToDelete(r)}>
            Delete
          </button>
        </div>
      ))}
      {toDelete && (
        <ConfirmDialog
          title={`Delete “${toDelete.name}”?`}
          body="It's removed from your logos in this browser. Creatives that already use it keep it."
          confirmLabel="Delete logo"
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const id = toDelete.id;
            setToDelete(null);
            void library?.deleteLogo(id).then(refresh);
          }}
        />
      )}
    </details>
  );
}
