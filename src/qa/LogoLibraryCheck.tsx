import { useCallback, useEffect, useState } from "react";
import { LOGO_BACKGROUNDS, logoPlateFill } from "@/design-system/brand";
import { resolveImage, type ResolvedImage } from "@/assets/resolveImage";
import { LOGO_ACCEPT } from "@/assets/logoFiles";
import { uploadPartnerLogo, addLibraryLogo } from "@/assets/uploadLogo";
import { BUILTIN_LOGOS, SIS_LOGO_ID } from "@/assets/catalog";
import { createBlankProject } from "@/model/blank";
import type { ImageSource } from "@/model/assets";
import type { LogoBackground, Project } from "@/model/project";
import { LogoUploadError, type LogoRecord } from "@/persistence/types";
import { LOGO_LIBRARY_HELP, requestPersistentStorage } from "@/persistence/storageStatus";
import { assessLogo } from "@/validation/logoChecks";
import type { Issue } from "@/validation/types";
import { getServices, type Services } from "@/services";

function Img({ source, services, height = 56 }: { source: ImageSource; services: Services; height?: number }) {
  const [r, setR] = useState<ResolvedImage | null>(null);
  useEffect(() => {
    let live = true;
    let release = () => {};
    resolveImage(source, services.blobs).then((res) => {
      if (!live) return res.status === "ready" && res.release();
      if (res.status === "ready") release = res.release;
      setR(res);
    });
    return () => {
      live = false;
      release();
    };
  }, [source, services]);
  if (!r) return <span className="qa-muted">Loading…</span>;
  if (r.status === "missing") return <span className="qa-missing">Logo missing — re-upload</span>;
  return <img src={r.url} alt="" style={{ maxHeight: height, maxWidth: "100%", width: "auto", height: "auto", display: "block", objectFit: "contain" }} />;
}

/**
 * Developer check for the logo pipeline: upload → add to creative → save to
 * library, then rename, delete and the missing-file state. Uses the real
 * IndexedDB library in this browser.
 */
export function LogoLibraryCheck() {
  const [services, setServices] = useState<Services | null>(null);
  const [error, setError] = useState("");
  const [logos, setLogos] = useState<LogoRecord[]>([]);
  const [project, setProject] = useState<Project>(() => createBlankProject("qa"));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [background, setBackground] = useState<LogoBackground>("none");

  const refresh = useCallback(async (s: Services) => setLogos(await s.logos.listLogos()), []);

  useEffect(() => {
    getServices()
      .then((s) => {
        setServices(s);
        return refresh(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Browser storage is unavailable."));
  }, [refresh]);

  if (error) return <p className="qa-missing">{error}</p>;
  if (!services) return <p className="qa-muted">Opening browser storage…</p>;

  const onUpload = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    const all: Issue[] = [];
    let next = project;
    for (const file of Array.from(files)) {
      try {
        const res = await uploadPartnerLogo(next, file, services.logos);
        next = res.project;
        all.push(...res.issues);
      } catch (e) {
        all.push({ id: "upload-" + file.name, level: "blocking", message: e instanceof LogoUploadError ? e.message : `${file.name}: upload failed.` });
      }
    }
    setProject(next);
    setIssues(all);
    void requestPersistentStorage();
    await refresh(services);
  };

  const fill = logoPlateFill(background, project.style.accent);
  const sis = BUILTIN_LOGOS.find((l) => l.id === SIS_LOGO_ID)!;

  return (
    <div className="qa-stack">
      <p className="qa-muted">{LOGO_LIBRARY_HELP}</p>

      <label className="qa-upload">
        Upload logos (SVG, PNG, JPEG, WebP, GIF, PDF)
        <input type="file" id="qa-logo-upload" accept={LOGO_ACCEPT} multiple onChange={(e) => { void onUpload(e.target.files); e.target.value = ""; }} />
      </label>
      {issues.map((i, n) => (
        <p key={i.id + n} className={i.level === "blocking" ? "qa-missing" : "qa-warn"}>{i.message}</p>
      ))}

      <h3>Current creative</h3>
      <div className="qa-row">
        {(Object.keys(LOGO_BACKGROUNDS) as LogoBackground[]).map((b) => (
          <button key={b} type="button" className="qa-chip" aria-pressed={background === b} onClick={() => setBackground(b)}>
            {LOGO_BACKGROUNDS[b].label}
          </button>
        ))}
      </div>
      <div className="qa-logo-row qa-checker">
        <div className="qa-logo-cell"><img src={sis.url} alt="Sisters in Sweat" style={{ height: 56 }} /><span>SIS · always included</span></div>
        {project.logos.partners.map((p) => (
          <div key={p.id} className="qa-logo-cell">
            <div style={{ background: fill ?? "transparent", padding: fill ? 10 : 0 }}><Img source={p.source} services={services} /></div>
            <span>{p.source.kind === "upload" ? p.source.name : "Nike (built-in)"}</span>
            <button type="button" className="qa-link" onClick={() => setProject({ ...project, logos: { ...project.logos, partners: project.logos.partners.filter((x) => x.id !== p.id) } })}>Remove from creative</button>
          </div>
        ))}
        <div className="qa-logo-cell">
          <Img source={{ kind: "upload", blobId: "deliberately-missing", name: "Missing" }} services={services} />
          <span>Simulated missing file</span>
        </div>
      </div>

      <h3>My logo library · {logos.length}</h3>
      <div className="qa-grid">
        {logos.map((l) => (
          <div key={l.id} className="qa-card">
            <div className="qa-checker qa-thumb"><Img source={{ kind: "upload", blobId: l.thumbnailBlobId, name: l.name }} services={services} height={64} /></div>
            <input
              id={"qa-rename-" + l.id}
              defaultValue={l.name}
              aria-label="Logo name"
              onBlur={async (e) => {
                try { await services.logos.renameLogo(l.id, e.target.value); } catch (err) { e.target.value = l.name; setError(err instanceof Error ? err.message : ""); }
                await refresh(services);
              }}
            />
            <span className="qa-muted">
              {l.originalType.toUpperCase()}{l.originalType === "pdf" ? " → PNG" : ""} · {l.meta.width} × {l.meta.height}{l.meta.vector ? " · vector" : ""}
            </span>
            {assessLogo(l.meta, l.name).map((i) => <span key={i.id} className="qa-warn">{i.message}</span>)}
            <div className="qa-row">
              <button type="button" className="qa-link" onClick={() => setProject(addLibraryLogo(project, l).project)}>Add to creative</button>
              <button type="button" className="qa-link" onClick={async () => { await services.logos.deleteLogo(l.id); await refresh(services); }}>Delete from library</button>
            </div>
          </div>
        ))}
      </div>
      <p className="qa-muted">Deleting a library logo that this creative uses leaves the creative's copy working.</p>
    </div>
  );
}
