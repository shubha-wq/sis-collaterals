# SIS Collaterals — project rules

Read `docs/ARCHITECTURE.md` first. This is a React + TypeScript + Vite rebuild
of the original tool in `docs/reference/original/`, which is reference only.
Never edit it or import from it.

## Process
- Work phase by phase (see ARCHITECTURE.md). After each phase run
  `npm run build`, `npm test`, and check the app in the browser. Don't
  start the next phase until the current one works and has been reviewed.
- Only change what was asked. If a request names the panel, don't touch the
  canvas or templates, and vice versa.

## Brand and creative rules
- The SIS logo is on every creative and can't be removed or deleted.
- Never create, recolour, plate or otherwise modify an SIS logo. Use only
  approved SIS assets. Open brand questions live in `docs/BRAND_DECISIONS.md`;
  don't resolve them in code without the brand owner's approval.
- Nike is the only built-in partner logo. All other partner logos are
  user-uploaded into that browser's logo library.
- Logos are transparent by default. Never add a plate, card or shadow unless
  the user picks Paper, White or Accent.
- Output sizes are exactly 1080 × 1350 (Instagram Creative) and 1600 × 1000
  (Website Banner, Website Listing).
- The five templates are Instagram only. Website Banner and Listing have
  their own renderers in `src/templates/website/` and never use a template.
- One source photo (`photo.source`) for every output. Never copy it per
  output; per-output framing only (`photo.web`).
- Website photos are never stretched, distorted or duplicated: uniform scale
  only (`layout/webPhotoPlan.ts`). A whole photo's free sides use the AI
  landscape (`src/expansion/`, `docs/AI_IMAGE_EXPANSION.md`). The original
  photo is never modified and is always drawn on top of the landscape. The
  edge fill is the fallback only when no provider is configured.
- AI provider keys are server-only (`server/`, `api/`, `netlify/functions/`).
  Never `VITE_`-prefix them and never call a provider from the browser.
  Generation happens once per photo (keyed); never regenerate on text, logo,
  colour, focus or output changes. Tests use fakes, never real paid calls.
- The Banner arc is SIS coral, anchored top-right; info inside it is flow
  layout. After website changes run `/qa/web` and `/qa/export`.

## Event title
- The `headline` field is the Event title (UI wording). It fits in its title
  area (`Title area=`; max height and lines per composition): one line at
  full size, else shrink to `ONE_LINE_MIN` for one line, else balanced
  explicit breaks (`layout/titleBreaks.ts`). Then the fit ladder applies. No
  truncation, no clipping.

## Text colours
- Text colour controls live beside their Content fields (ColourControl), never in a separate section.
- Every text block takes its colour from `env.paint.color(role, templateColour)`
  and carries `env.paint.attrs(role)`. A new text element in a template must
  do the same, or it can't be coloured and QA flags it.
- Only the approved palette (`TEXT_COLOURS`); no free colour input. Auto
  means the template's own colour. Contrast is a warning, never a block,
  and the app never changes a chosen colour.

## Logos panel
- Partner logos are chosen with one dropdown per slot (max 4). No thumbnails in the panel. SIS is never a choice.

## Creative Library
- Shared library = `src/library/` (Supabase). Drafts = `src/persistence/`
  (this browser). Don't merge them, and never back the library with
  localStorage or IndexedDB.
- Store the structured `Project`, never only a PNG. Assets go to team storage
  by content hash before a save succeeds.
- Library saves are explicit and version-checked; nothing autosaves there.
  Never add deletes or automatic retention without the owner's approval.
- Credentials only from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  Never use or commit a service-role key.

## Blank start and drafts
- The editor never opens with example content. New creatives come from
  `createBlankProject()` only. Example content lives in
  `tests/fixtures/projects.ts` and must never be imported by `src/`.
- Nothing is persisted until the person clicks Save draft. Saved drafts then
  autosave. Unsaved work is never stored or restored.
- Draft data safety (docs/DEPLOYMENT.md): never delete or clear the IndexedDB
  database or a store; upgrades only add stores. Drafts are upgraded on read
  (src/model/migrate.ts: bump SCHEMA_VERSION + add a STEP + defaults for any
  Project shape change); never rewrite on read; an unreadable draft is kept
  and reported (recovery), never replaced. Autosave only writes the open
  draft (same id). Run `npm run release-check` before releasing.
- New creative carries over output, template and format only.
- Drafts and the logo library are per browser in V1. A library logo is never
  added to a creative automatically.

## Templates
- All five templates are built from the shared kit in
  `src/templates/shared/kit.tsx`. A new template uses the kit; it never copies
  another template's code.
- Each template has exactly one detail style (Broadsheet Ledger, Poster
  Inline, Block Cards, Slab Rows, Ticket Tags). Never add a detail-style selector.
- Feed and Banner are two designed compositions, not one scaled to fit the other.
- No photo means a deliberate type-only composition, never an empty photo box.
- Absolute positioning only on marked layers (`data-layer` photo, overlay or hint).
- Run `/qa/templates` and `npm test` after any template change.

## Export
- Download goes through `src/export/exportCreative.tsx` only. It renders the
  template in export mode (no hints) at exact size, refuses "cannot fit", and
  verifies the PNG's pixel size.
- Only blocking review issues or loading images may disable Download.
  Warnings never block it.
- After any template or export change, run `/qa/export` as well as `/qa/templates`.

## Radius
- Use only the radius scale: `--radius-subtle|medium|large` in the UI,
  `--r-subtle|medium|large` inside creatives. No pills, no literal values.
- The exported canvas is always square (0). Elements reaching a canvas edge
  stay square at that edge.
- Contained photos use `IMAGE_RADIUS` (`var(--r-large)`), clipped. Full-bleed photo corners stay square.

## Layout rules
- Templates use the auto-layout primitives in `src/layout/`. Absolute
  positioning only for genuinely overlapping layers (photo under a gradient,
  for example).
- Text never overflows, clips, overlaps or vanishes. Respond to long content
  in this order: reflow, grow the container, tighten spacing, step type down
  within its floor, then warn. Never shrink the whole design.
- Empty fields collapse; no empty boxes.
- Auto is the default. Manual settings are overrides in `Project.overrides`.
  Resetting never deletes content.

## Code rules
- The UI never calls `localStorage` or IndexedDB directly. Go through
  `src/persistence/`.
- Projects store image references (`ImageSource`), never image bytes. Data
  URLs exist only in backups and at export time.
- Never reference local machine paths. Built-in assets are imported from
  `src/assets/library/` or served from `public/`.
- Week Ahead schedule data stays separate from presentation, behind
  `ScheduleSource`.
