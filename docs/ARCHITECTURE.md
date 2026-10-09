# Architecture

React + TypeScript + Vite, static single-page app. No backend. Deploys as
plain files to Vercel or Netlify. The original custom-runtime tool in
`docs/reference/original/` is the functional and visual reference; none of
its runtime (`support.js`, `.dc.html`) is used.

## Modules (`src/`)

| Folder | Responsibility | Depends on |
|---|---|---|
| `design-system/` | SIS tokens as CSS custom properties (`tokens/*.css`, the rendering source of truth) mirrored in typed `tokens.ts`; brand choices (`brand.ts`: accents, text colours, logo plates); self-hosted fonts; UI primitives (Wordmark now; Button, Chip, Section, Swatch, Field with the editor) | model (types only) |
| `model/` | Content model types and defaults: `Project`, formats, assets references. No rendering | nothing |
| `layout/` | Auto-layout engine: Frame / Stack / FitText (hug, fill, fixed, min/max, padding, gap, align, wrap) | design-system |
| `templates/` | Broadsheet, Poster, Block, Slab, Ticket, plus shared parts (DetailBox, LogoRow, CityTag, Photo). Composed only from `layout/` | layout, model, design-system |
| `assets/` | Built-in library (`catalog.ts`, bundled with hashed URLs); upload processing (`browserLogoProcessor`: PDF→PNG, corner check, thumbnails, dimensions); `resolveImage` (never throws; returns "missing"); `uploadPartnerLogo` (upload → library → creative) | model, persistence (contracts), validation |
| `state/` | Edits as data (`edits.ts`), the session controller (blank start, explicit drafts, autosave), `useEditorSession` hook; undo/redo and selectors later | model, persistence (contracts) |
| `persistence/` | Storage contracts (`ProjectStore`, `SessionStore`, `LogoLibrary`, `BlobStore`), V1 IndexedDB implementations (database `sis-collaterals` v3: `blobs`, `logos`, `projects`, `meta`, `photos`), in-memory fallbacks; backup JSON later | model |
| `export/` | Off-screen 1:1 render to PNG, real downloads, ZIP | model |
| `validation/` | Pure rules returning review-box issues | model |
| `week-ahead/` | `ScheduleSource` contract, manual data, pagination cost model, themes, four styles | layout, design-system |
| `editor/` | Panel (Content · Photo · Logos · Style · Details · Fine-tune), canvas, review box | everything above |
| `qa/` | Developer QA grid: template × fixture × format | templates, model |

Rule: the UI never touches `localStorage` or IndexedDB directly. Only
`persistence/` does. `src/services.ts` is the composition root: the one
file that chooses implementations (IndexedDB today, cloud storage later).

## Projects, sessions and drafts

Five concepts, kept separate in code and storage:

| Concept | Where it lives | Persists? |
|---|---|---|
| 1. Blank/new project | `model/blank.ts` → `createBlankProject()` | Not stored. No text, no photo, no partner logo |
| 2. Current unsaved session | `state/sessionController.ts`, in memory | **Never written to storage** |
| 3. Explicitly saved draft | `ProjectStore` (IndexedDB `projects`) | Yes, in this browser only |
| 4. Built-in brand assets | `assets/catalog.ts` (SIS, Nike, photo library) | Bundled, read-only. Not event content |
| 5. User logo library | `LogoLibrary` (IndexedDB `logos` + `blobs`) | Yes, in this browser only. Never added to a creative automatically |
| 6. User photo library | `PhotoLibrary` (IndexedDB `photos` + `blobs`) | Yes, in this browser only. Independent of drafts; never added to a creative automatically |

Rules (enforced in `SessionController`, covered by `tests/session.test.ts`):

- **Launch.** If a saved draft was open last time (`SessionStore`, IndexedDB
  `meta`), reopen it. Otherwise start blank. Unsaved work is never stored,
  so it can't come back.
- **Save draft** is the only way a creative becomes persistent. After it,
  every edit autosaves to that draft after 600 ms, and immediately on tab hide.
- **New creative** creates a blank project. Only template and format carry
  over; text, photo, partner logos, accent, logo background and overrides
  never do. The next launch is blank.
- **Unsaved work is protected.** New creative or opening another draft asks
  first ("Discard this creative?"), and closing the tab triggers the
  browser's leave-page warning. Saved drafts never ask, because they're
  already saved.
- **Deleting the open draft** leaves its content on screen as unsaved work,
  so nothing vanishes mid-edit.
- **Drafts are per browser in V1.** There's no shared or global store.
  Moving a draft to another computer is done with a project backup (Phase 8).
- **No storage.** If IndexedDB can't open, the editor still works on
  in-memory stores and says that drafts can't be saved in this window.
- **Example content** exists only in `tests/fixtures/projects.ts`. A test
  fails if `src/` references it, or if editor, state, model or template code
  contains sample event text.

Edits are plain data (`state/edits.ts`) applied synchronously, so the canvas
shows each change in the same render. Removing a field empties it, and
templates collapse empty fields (Phase 4 onwards).

## Layout engine and templates

- **Canvas units.** Templates render at real export size (1080 × 1350 or
  1600 × 1000). Every measurement is in units of a 1080-wide grid
  (`--u`). The editor scales the whole canvas with a transform, so
  screen size never changes the layout.
- **`Frame`** (`layout/Frame.tsx`) is the auto-layout box: direction, hug,
  fill or fixed sizing, min/max, padding, gap, alignment and wrap. Spacing
  multiplies by `--sp` so the fit ladder can tighten it. `Layer` is the only
  overlap primitive, used for tags and logos over the photo.
- **Fit order.** `useAutoFit` runs it after every render, using real
  geometry:
  1. Text wraps naturally; typed line breaks are always respected.
  2. Containers grow or rebalance: the feed photo yields to the panel down
     to 24% of the height; the banner panel widens to 1.45 shares.
  3. Spacing tightens, down to 72%.
  4. The headline steps down, to a hard floor of 66% of its base size.
  5. Otherwise the template reports "cannot fit", which blocks export.

  A single word wider than the column is sized to fit before the ladder
  runs (iteratively, because Bricolage's optical-size axis isn't linear),
  and may break only at the floor. Nothing else ever shrinks, and the
  headline is never shrunk just to keep a line arrangement.
- **Logos** are sized optically (`layout/logoSizing.ts`): equal area, aspect
  ratio kept, extremes clamped, slightly smaller as more partners join.
- **Templates** are pure views of `{ project, images, mode }`. In `editor`
  mode they may draw hints for empty slots; `export` never does. Template
  CSS is isolated from editor element styles.
- **All five templates are built** on the shared kit (`templates/shared/kit.tsx`):
  `useTemplateEnv` (derived colours/content), `TemplateCanvas` (exact size, square
  root, units, auto-fit), `Title`, `TopBar`/`CityTag`/`Logos`, `AddPhotoHint`,
  `makeLadder` and the shared fit checks. Any box marked `data-fit-box` must not
  overflow; that is how every template detects "too much content".
- **Absolute positioning** is allowed only for marked layers: `data-layer="photo"`
  (photo fills), `"overlay"` (tags/logos over a photo) and `"hint"` (editor-only).
  A unit test enforces this for every template.

## The five templates

Each template has one fixed detail treatment (no user selector) and two
intentional compositions, not one scaled to fit the other.

| Template | Feed (1080 × 1350) | Banner (1600 × 1000) | No photo | Details | Logos |
|---|---|---|---|---|---|
| **Broadsheet** | Paper page: masthead (accent square, city, rule), headline, inset photo (soft corners) that fills down to a floor | Headline column beside the photo; photo share yields to text | Larger headline leads; open paper; details at the foot | **Ledger**: large date numeral, time/venue right, dotted rule | Masthead, right |
| **Poster** | Full-bleed photo; content on a dark fade that grows with the content | Same, shorter fade lead-in; content column capped for line length | Dark ink poster, same type and accent bar | **Inline**: one dot-separated run | Top-right over photo |
| **Block** | Photo fills, colour panel hugs content | Photo and panel share the row; panel widens when needed | Colour poster; top bar; larger headline at the foot | **Cards** | Top-right over photo |
| **Slab** | Full-bleed photo; colour (or ink) slab spans the margins, heavy top rule | Slab capped ~62% wide, widens to 86% if needed | Slab on the opposite ground (ink under colour, colour under ink) | **Rows**: labelled table | Top-right |
| **Ticket** | Photo fills; perforated stub below | Photo left, stub right, perforation between | Whole canvas is the ticket; perforation separates headline from details | **Tags**: solid accent tags | Over photo top-right (top bar when no photo) |

Fine-tune extras, shown only where they apply: Broadsheet **Background**
(Paper / Tint / Colour) and Slab **Slab colour** (Colour / Ink).

**Fit ladders per template** (after natural wrapping, always on):
- **Broadsheet / Block / Ticket:** photo share 36% → 24% (feed); photo or panel share (banner).
- **Poster:** fade lead-in 260 → 90 units (feed), 150 → 50 (banner).
- **Slab:** slab width cap 62% → 86% (banner).

Then spacing tightens to 72%, then the headline steps to its 66% floor, then
"cannot fit". Type-only compositions start with a larger headline (1.15–1.45×)
and step further, never below the absolute floor.

## Radius system

- **Photos:** a photo contained inside the composition uses `IMAGE_RADIUS`
  (`--r-large`, 16 canvas units). It is clipped to that shape, so the
  photo itself is rounded, not just a border.
- Any photo corner on the canvas edge (full-bleed) stays square, and the
  canvas is always 0.
- In practice only Broadsheet's inset photo is contained. The other
  templates, Website Banner and Website Listing photos reach the canvas
  edge.
- `/qa/templates` and `/qa/web` check every photo corner.


Soft, restrained corners. Not bubbly, never pills.

| Token | UI (px) | In creatives (canvas units, `--r-*`) | Use |
|---|---|---|---|
| subtle | `--radius-subtle` 4 | `--r-subtle` 6 | thumbnails, logo plates, tags, small controls, Slab, Broadsheet photo |
| medium | `--radius-medium` 8 | `--r-medium` 10 | buttons, inputs, chips, cards, review box, detail cards, editor hint |
| large | `--radius-large` 12 | `--r-large` 16 | dialogs, menus, large panels |

- **The exported canvas is always square.** `.tpl-canvas` sets
  `border-radius: 0 !important`, and QA checks every case.
- Anything that reaches a canvas edge (full-bleed photos, panels, fades) stays
  square at that edge. Only elements inside the margins get soft corners.
- No other radius values are allowed. Tests reject literal radii, pills
  (`--radius-pill`, `999`) and anything outside the scale; only 0, 50% (dots)
  and `inherit` are exempt.

## Logo legibility

Logos are never plated automatically. Each logo's tone (dark, light or mixed)
is known for built-ins and measured from opaque pixels for uploads
(`assets/logoTone.ts`). Each template declares the solid ground its logos sit
on in each state (`templates/logoGround.ts`). When a logo matches a dark or
light ground and no plate is chosen, the review box warns and names the fix
(Paper/White, or Accent).

## Outputs: Instagram Creative, Website Banner, Website Listing

`style.output` (`model/outputs.ts`) says what the creative is for. Every
consumer (editor stage, export, QA) resolves what to draw through
`templates/outputs.ts` → `rendererFor(project)`.

| Output | Size | Renderer | Editor sections |
|---|---|---|---|
| Instagram Creative | 1080 × 1350 | one of the five templates (unchanged) | Content, Photo, Logos, Style, Details, Fine-tune |
| Website Banner | 1600 × 1000 | `templates/website/WebsiteBanner.tsx` | Content (headline, date, day, time, venue, city), Photo, Logos |
| Website Listing | 1600 × 1000 | `templates/website/WebsiteListing.tsx` | Photo |

- The five templates are **Instagram only**. The Output picker labels this
  ("5 templates" vs "No template"), and Style says "Template · Instagram only".
  The templates' own banner compositions stay in code and QA, but the
  editor's Instagram Creative is always the feed size. Drafts saved before
  outputs existed load as Instagram Creatives (`normalizeProject`).
- **One photo.** `photo.source` is the only reference, shared by all three
  outputs; switching output never touches it, and replacing it updates all
  of them. Per-output framing for the website outputs lives in
  `photo.web[output]`. It stores only what the person changed, and it is
  cleared when the photo changes. `webFraming()` fills in the defaults.
- **New creative** carries over output, template and format.

### AI background expansion

See `docs/AI_IMAGE_EXPANSION.md`. In short:

- A whole photo's free sides come from one AI-generated landscape per
  source photo (`src/expansion/`).
- Listing and Banner are windows onto that landscape, and the untouched
  original is drawn on top.
- The server function `/api/expand-image` (`server/expansion/`) holds the
  provider key. The provider is swappable via `ImageExpansionProvider`, and
  the default is Stability Outpaint.
- The derivative is `photo.expansion` (a file reference). It is cached and
  shared with the library, and cleared when the photo changes.

### Website photo treatment (no distortion)

`layout/webPhotoPlan.ts` is pure geometry. The photo is only ever scaled
uniformly and drawn once, as an `<img>` at the planned rectangle. Its
original pixels are resampled once by the browser and never redrawn.

- **Fill frame (crop):** covers 1600 × 1000, cropped around the focal point.
  Zoom goes up to 2.5×, and the focal point always stays in frame.
- **Whole photo (fit):** the entire photo is visible. The free sides are
  filled by `templates/website/extension.ts`, which reads only the outermost
  3% strip of the photo on each bordering side. It averages that strip into a
  short line of colours, spreads it as a soft gradient field, eases it towards
  the edge's mean colour, and deepens it slightly towards the canvas edge.
  People and objects are never copied, mirrored or reshaped.
- **Auto:** crops when a 16:10 crop keeps at least 72% of the photo (3:2,
  4:3, 16:9); otherwise it shows the whole photo (square, portrait,
  panorama). On the Banner, a whole photo defaults to the left so the arc
  covers extended background rather than the photo.
- The export waits for the extension (`data-pending`) before rendering.
- **Limitation:** there is no subject detection and no generative outpainting
  (that would need an external AI service, which was deliberately not added).
  The extension reads as soft background, not new scenery. When Auto's
  choice isn't right, the person picks Fill frame / Whole photo and moves the
  focal point.

### Website Banner arc

- The arc is a decorative SVG layer (`data-layer="decor"`): a quarter
  ellipse centred on the canvas's top-right corner, in SIS coral
  (`COLORS.coral`, `--coral`). Its outer edges stay square.
- The info (headline, then Date / Time / Venue with bold labels and wrapping
  values, then city) is normal flow layout, top-right inside the margins. It
  is never absolutely positioned.
- `bannerCheck` measures the info's far corner and sizes the ellipse to
  contain it with breathing room (`layout/arc.ts`, √2 × reach). The arc is
  held between 38% × 48% of the canvas (always bold) and 74% × 94%.
- Fit ladder: widen the info column (30% → 50%), then tighten spacing, then
  step the headline down to its floor. Beyond that: cannot fit, and
  Download is blocked.
- Text on the arc is ink. Ink on coral is about 6:1 contrast, against about
  3:1 for white; the reference used white.
- SIS and partner logos sit bottom-left on the photo through the existing
  logo row; Paper, White and Accent plates are available. Logos must stay
  clear of the arc.
- Everything is optional. Photo only shows the arc at its minimum size.

## Event title fitting

- The `headline` field is the **Event title** in the UI.
- `Title` renders words as spans with breakable gaps. `fitTitle`
  (`templates/shared/kit.tsx`) runs on every fit rung and:
  1. keeps each typed line on one line at full size;
  2. otherwise shrinks it (down to `ONE_LINE_MIN` 0.74) to keep one line;
  3. otherwise wraps with explicit balanced breaks (`layout/titleBreaks.ts`):
     fewest lines, even lengths, a connector never left at a line end when
     it can move down, typed breaks kept. A modest further step (down to
     `FEWER_LINES_MIN` 0.85) is taken if it saves a line or frees a
     connector.
- The breaks are applied to the DOM, so the export wraps identically.
- Each composition gives the title an area: `maxHeight` (share of canvas
  height) and `maxLines`. The defaults are 34% and 4 lines with a photo, and
  50% and 5 lines type-only, and typed lines always count.
- If the title exceeds its area, the ladder tightens spacing, steps the
  title down to its 66% floor and finally tightens leading (`--hlh`). Then
  it reports cannot fit.
- `/qa/templates` checks every title is inside its area and clear of the
  photo, shrank before wrapping, has balanced lines, and has no dangling
  connector.

## Independent text colours

- **Model:** `Project.textColours?: Partial<Record<TextRole, TextColourChoice>>`.
  - The roles are headline, subheader, date, day, time, venue, date-label,
    time-label, venue-label, city and notes.
  - The colours are the approved text palette (`TEXT_COLOURS`: Ink,
    Paper/off-white, Coral, Teal, Royal blue, Golden). A missing key means
    Auto; there is no free colour picker.
- **Rendering:** every text block asks `env.paint.color(role, templateColour)`
  (`templates/shared/paint.ts`).
  - A block's own colour wins. Otherwise the template's colour stands,
    including the Fine-tune "All text colour". Roles never share state.
  - The date line is split into date and day spans, so they colour
    separately but read as one line.
  - Each block carries `data-text-role` (and `data-text-override` when set),
    which QA and the contrast check use.
- **Coverage:** all five templates in feed, banner and no-photo states, and
  the Website Banner (labels and values separately). The Listing has no text.
- **Panel:** a compact colour button sits beside each Content field (`editor/ColourControl.tsx`).
  - It opens a small popover with Auto plus the palette for that field's
    blocks: the value, and the label where the design prints labels (Block,
    Slab, Banner).
  - Only blocks the current design renders get controls
    (`designTextRoles`). There is no separate colour section.
- **Contrast:** after each layout the canvas measures each overridden block
  against its real ground (`templates/shared/contrast.ts`).
  - The ground is its own or an ancestor's solid background, the Banner arc,
    or the canvas.
  - Text over a photo isn't judged, because it has no single ground.
  - Below 3:1 the Review shows an advisory warning naming Ink or Paper. It
    never blocks download and never changes the colour.

## Creative Library (shared)

See `docs/CREATIVE_LIBRARY.md`. In short:

- `library/` holds:
  - `CreativeLibrary`: saving, opening, versions and asset sharing;
  - `LibraryBackend` with `SupabaseLibraryBackend` and
    `MemoryLibraryBackend` implementations;
  - `SharedAssetStore`, content-addressed by the same SHA-256 `blobId` the
    browser uses;
  - pure search and filters.
- The full `Project` is stored as JSON, with a few copied columns for the
  list.
- Saves are explicit (Save to Library, Save changes, Save as new) and
  version-checked. Replaced versions are kept, and the app never deletes
  anything.
- `project.library` links a creative to its library version, and
  `SessionView.libraryDirty` tracks unsaved library changes. Local Drafts are
  unchanged.
- Supabase is loaded on demand from `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`. Without them, the dev server uses a labelled
  in-memory preview and production shows setup instructions.

## Export (Download)

- **One primary action:** **Download** beside the canvas heading. It's
  disabled, with the reason, only when the image would be wrong: blocking
  review issues (no headline on Instagram, no photo on the website outputs,
  a missing photo or logo file, "cannot fit") or
  images still loading. Advisory warnings (logo legibility, low-res photo,
  missing optional fields) never block.
- **Pipeline** (`export/exportCreative.tsx`):
  1. Mount the template in **export mode** (no editor hints) at exact size
     in a hidden, untransformed stage.
  2. Wait for fonts and for the fit loop to settle. Refuse "cannot fit".
  3. Wait for every image to load (15 s limit; `decode()` is capped at 2 s,
     because it can stall in background tabs).
  4. Render with `modern-screenshot` (bundled; it embeds the app's own fonts
     and inlines images, including blob: uploads and SVG logos).
  5. Decode the PNG and verify its exact pixel size before handing it over.
- **Same engine, same result.** The export uses the same template and fit
  rules as the editor; only the editor-only hints are absent, and those never
  affect layout.
- **Filename** (`export/filename.ts`): `SIS_[City]_[Date]_[Template]_Instagram-Creative.png`,
  `SIS_[City]_[Date]_Website-Banner.png`, `SIS_[City]_[Date]_Website-Listing.png`.
  The date is read from free text as `DD-Mon-YYYY`, with the typed year, or else
  the next time that date comes round. A missing city or date is omitted.
  Only letters, digits and hyphens appear inside each part (safe on macOS and Windows).
- **Real browser download** via an object URL and `<a download>`.
- **Not yet:** batch or ZIP export. Single creatives only.

## Logos and deletion safety

- Uploaded files go into a content-addressed `BlobStore` (key = SHA-256).
  The library and projects both reference the hash, never the bytes.
- A project's partner logo is `{ kind: "upload", blobId, libraryId?, name }`.
- `LogoLibrary.deleteLogo` removes the library entry only. The blob stays
  while any saved project still references it (`collectGarbage` checks this).
- If a blob is genuinely gone (site data cleared, partial import), the
  canvas shows a "logo missing — re-upload" placeholder, and validation
  blocks export. It never crashes.
- Files are stored as ArrayBuffer + MIME type (reliable in every browser,
  including older Safari), in the IndexedDB database `sis-collaterals`.
- Project backups embed every blob the project uses, so they restore fully
  in another browser and re-add the logos to that browser's library.

## Current product scope: the manual workflow

The product is the manual creative workflow only:

1. **Content:** typed fields.
2. **Photo:** SIS library, or upload into this browser's photo library.
3. **Logos:** SIS always on; Nike, or upload into this browser's logo library; rename and delete; search once there are more than 8.
0. **Output:** Instagram Creative, Website Banner or Website Listing (only the relevant sections are shown).
4. **Style:** template (built ones only), colour. Instagram only.
5. **Fine-tune.**
6. **Drafts.**

Details is shown only for templates that offer a choice (Block doesn't).

Schedule data is **paused**. `week-ahead/types.ts` (`ScheduleSource`) stays
as a contract for later. Nothing implements it or exposes it: no Sheets, no
import, no picker, no Week Ahead UI.

## Routes

| Path | Page | Availability |
|---|---|---|
| `/` | Editor | Always |
| `/qa` | Design system + logo library checks | Dev server; production only with `VITE_ENABLE_QA=true` |
| `/qa/templates` | Layout QA matrix, all templates | Same |
| `/qa/export` | Real PNG export QA (Instagram + website outputs) | Same |
| `/qa/web` | Website Banner / Listing QA matrix (incl. text colours) | Same |

Both hosts rewrite unknown paths to `index.html` (`vercel.json`,
`netlify.toml`).

## Build phases

1. Project setup and architecture contracts. **(done)**
2. Design system, assets and the logo-library foundation. **(done)**
   - 2b. Blank start, explicit drafts and New creative. **(done)**
3. Layout primitives, Block template and Block stress test. **(done)**
   - 3b. Broadsheet, Poster, Slab, Ticket on the shared kit; radius system. **(done)**
   - 3c. Download (PNG export) for the current creative. **(done)**
7. Asset management UI (logo picker, uploads in the editor, photo picker)
8. Export
9. Week Ahead
10. QA route and edge-case testing
