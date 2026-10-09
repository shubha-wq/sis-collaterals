# Edge cases

Every template (Broadsheet, Poster, Block, Slab, Ticket) is tested against
every case below, in both formats. A pass means: no overflow, clipping,
overlap or vanished text; no type below its floor; empty fields collapse;
the app doesn't crash. Results are filled in as each template is built
(Phase 5 for Block, Phase 10 for the rest), and the `/qa` route renders the
full grid.

## Content cases

| # | Case | Fixture | Expected behaviour |
|---|---|---|---|
| 1 | Minimal content | Headline only | Layout holds its proportions; empty detail rows collapse |
| 2 | Normal content | Padel Coaching Workshop defaults | Reference composition |
| 3 | Very long headline | 6 words, one 14-letter word | Reflows, panel grows, type steps down within limit, then warns |
| 4 | Very long venue | "St. Joseph's University Indoor Basketball Court, Langford Road" | Wraps inside the detail block; never pushes off canvas |
| 5 | Missing subheader | Empty | No gap left above the headline |
| 6 | Missing time | Empty | Time row removed, not left blank |
| 7 | Missing venue | Empty | Venue row removed, not left blank |
| 8 | Missing date | Date and day empty | Date row removed; review box warns |
| 9 | Multiple partner logos | Nike + 3 uploads | Logo row wraps or scales evenly; SIS always present |
| 10 | Transparent logos | PNG with alpha, SVG | No plate by default |
| 11 | White logos | White-on-transparent PNG | Visible only on dark grounds; review box suggests a plate on light ones |
| 12 | Portrait image | 1066 × 1600 | Crop keeps the focal point |
| 13 | Landscape image | 1600 × 1000 | Crop keeps the focal point |
| 14 | Tiny image | 400 × 300 | Renders; review box warns it may look blurry |
| 15 | Feed format | 1080 × 1350 | All of the above |
| 16 | Banner format | 1600 × 1000 | All of the above |

## Additional cases

| Case | Expected behaviour |
|---|---|
| Library logo deleted after use in a project | Project still renders from its stored blob |
| Logo file missing entirely (site data cleared) | "Logo missing" placeholder; export blocked with a clear message |
| Logo with a baked-in white background | Warning shown; file never modified |
| Week Ahead: long time string ("11:30 – 12:30 PM") | Never runs into the event name (seen in the original tool; see `ASSET_CATALOGUE.md`, group 6) |
| Week Ahead: city with no events this week | Slide flagged as empty in the review box |
| Week Ahead: week longer than two sheets | Splits across at most two sheets, then scales within limits |

## Logo and asset cases (Phase 2)

How each case is handled. **Tested** means an automated test covers it;
**Browser** means it was checked on `/qa` with real files in Chromium.

| Case | Behaviour | Verified |
|---|---|---|
| Transparent PNG | Stored byte-for-byte; alpha kept. Built-in PNGs are checked to be RGBA | Tested, Browser |
| SVG | Stored as the original SVG and drawn as an image, so it stays vector at any size. Size read from width/height or `viewBox` (Firefox reports 0 for some SVGs) | Tested, Browser |
| JPEG / WebP / GIF | Accepted and stored as uploaded. JPEG has no transparency, so a white JPEG triggers the background warning | Browser |
| PDF | Page 1 rendered to a transparent PNG at up to 2400 px, trimmed to the artwork. The original PDF is kept too. pdf.js is bundled and loads only on a PDF upload | Browser |
| Unsupported file (.ai, .heic, …) | Refused: "Upload an SVG, PNG, JPEG, WebP, GIF or PDF logo." | Tested, Browser |
| Near-white opaque corners | Warning only; the file is never altered and no plate is added | Tested, Browser |
| Very large logo (file) | Over 25 MB refused with a clear message. Large dimensions are accepted; previews are downscaled | Tested (limit) |
| Very small logo | Raster under 400 px on its long side: "may look soft" warning. SVGs never get it | Tested, Browser |
| Unusual aspect ratio | Wider or taller than 6:1: warning that it will look thin or narrow. Layout handling comes with the templates | Tested, Browser |
| Same file uploaded twice | One library entry; it's never added to a creative twice | Tested |
| More than 4 partner logos | Saved to the library and not added, with a message. Nothing is replaced silently | Tested, Browser |
| Missing library asset | Resolves as "missing": placeholder "Logo missing — re-upload". Never throws | Tested, Browser |
| Library logo deleted while a project uses it | Only the library entry goes. The project still renders it from the stored file | Tested, Browser |
| Storage clean-up | Removes only files no saved project and no library entry uses | Tested |
| Browser or site data cleared | Every uploaded file becomes "missing" (above). The app asks the browser for persistent storage after the first upload. The help text tells people uploads live in this browser, and that Safari may clear them after about a week without a visit. Project backups (Phase 8) are the recovery path | Documented |
| Storage unavailable or blocked | Opening storage fails with a readable message ("busy in another tab"…); a later attempt retries | Code path |
| Plain-http LAN address (no Web Crypto) | Uploads still work with a unique id instead of a content hash (no de-duplication) | Code path |

## Blank start and drafts (Phase 2b)

| Case | Behaviour | Verified |
|---|---|---|
| First launch | Blank creative: no text, photo or partner logo. The template structure and the SIS logo only | Tested, Browser |
| Refresh with no saved draft | Blank | Tested |
| Unsaved content, then close and reopen | Blank. Unsaved work was never written; the browser warns before the tab closes | Tested (state); leave-page warning in code |
| New creative | New id, blank content; only template and format carry over | Tested |
| New creative with unsaved work | In-page "Discard this creative?" dialog | Code path (needs content controls to try in the browser) |
| Save draft on an empty creative | Disabled ("Add something to the creative first") | Browser |
| Saved draft, edit, reopen | Reopens with the latest edits (autosave) | Tested |
| Saved draft in browser A, open browser B | B starts blank with no drafts | Tested (separate storage) |
| Last-opened draft deleted elsewhere | Launch falls back to blank | Tested |
| Delete the open draft | Content stays on screen as unsaved | Tested |
| Logo in library, New creative | The library keeps it; the creative doesn't get it | Tested |
| Upgrade from storage v1 (Phase 2 logos) | Logos kept, draft stores added | Tested |
| Browser storage unavailable | Editing works in memory, with a message that drafts can't be saved | Code path |
| Sample event content in the app | None: a test scans editor, state, model, template and layout code | Tested |
| Photo added / removed | On the canvas in the same render | Tested (state + Block render), Browser |
| Logo added / removed | On the canvas in the same render | Tested (state + Block render), Browser |
| Removing content reflows the layout | Elements removed; space redistributed | Tested (Block render), Browser |

## Manual workflow walkthrough (browser, Chromium)

| Step | Result |
|---|---|
| First launch | Blank type-only Block; Content section open; review lists what's needed |
| Type name, date, day, time, venue, city | Each appears on the canvas immediately; Content summary updates |
| Upload a photo | Saved to "Your photos" and placed on the canvas; Block switches to the photo composition |
| Pick a library photo / remove photo | Canvas updates immediately; removing returns to type-only |
| Add Nike, upload a logo | Upload → library → creative in one action; both top-right, no plate |
| Rename a library logo | New name shows in the library and on the creative's logo list |
| Save draft, reload | The draft reopens; sections collapsed |
| New creative | Blank, Content open; your photos and your logos still there |
| New creative with unsaved text | "Discard this creative?" confirmation |
| Reload after New creative | Blank; the saved draft is listed under Drafts |
| Delete a library photo or logo | Confirmation; creatives already using it keep it |

## Block QA matrix (Phase 3, revised after review)

Live at `/qa/block` (dev server). Every fixture renders in **feed and banner**
exactly as exported (no editor hints), and the page runs these automated
geometry checks on each:

1. **Fit:** no "cannot fit" unless expected.
2. **No text overflow:** headline, subheader, details, notes and city all wrap inside their boxes.
3. **Inside canvas:** no text or logo extends past the edges.
4. **No overlap:** between any text blocks and logos.
5. **SIS present and visible.**
6. **Partner logo count is correct.**
7. **Headline stays at or above its floor** (66% of preferred).
8. **No editor hints in exports**, except the "logo missing" placeholder.
9. **Logo plates match the setting:** none by default; all logos plated when chosen.
10. **Stacked panel elements keep at least 15 units of space.**
11. **Photo is cropped (object-fit: cover), never distorted.**

Filter with `?only=normal,long-venue` and enlarge with `?scale=0.5`.
Results are also on `window.__blockQA` for scripted runs.

| Fixture | Composition | Feed | Banner |
|---|---|---|---|
| Completely blank | Type-only (editor hints only; export blocked: no headline) | Pass | Pass |
| Headline only | Type-only | Pass | Pass |
| Details only | Type-only (export blocked: no headline) | Pass | Pass |
| Photo only | Photo | Pass | Pass |
| Headline + photo | Photo | Pass | Pass |
| Minimal (headline + date) | Photo | Pass | Pass |
| Normal content (full + photo) | Photo | Pass | Pass |
| Very long headline, typed breaks | Photo: typed breaks kept, lines wrap naturally | Pass | Pass |
| Very long headline, no breaks | Photo: natural wrapping | Pass | Pass |
| Single very long word | Sized so the word fits; breaks only at the 66% floor | Pass | Pass |
| Long venue / long time / long date | Card takes its own row and wraps | Pass | Pass |
| 0, 1, 2, 3, 4 partner logos | One row; SIS last | Pass | Pass |
| 4 logos incl. 15:1 wordmark | Extreme aspect clamps | Pass | Pass |
| White logo, no plate | Transparency kept | Pass | Pass |
| Plates: Paper / White / Accent | Applied to every logo | Pass | Pass |
| No photo, full content, 1 logo | Type-only | Pass | Pass |
| No photo, 0 partner logos | Type-only | Pass | Pass |
| No photo, 4 partner logos | Type-only, logos top-right | Pass | Pass |
| No photo, very long headline | Type-only, natural wrap | Pass | Pass |
| No photo, royal blue | Type-only | Pass | Pass |
| Portrait / panorama (4:1) / very tall (1:5) photo | Cropped, not distorted | Pass | Pass |
| Tiny photo (200 × 150), low-res library photo | Warning only | Pass | Pass |
| Every field, long | Photo | Pass | Pass |
| Long city | City tag wraps | Pass | Pass |
| Royal blue / golden yellow accents | Contrast-safe text and labels | Pass | Pass |
| Headline: Large override | | Pass | Pass |
| Missing logo file | Placeholder; export blocked | Pass | Pass |
| Absurd amount of text | Fits by tightening | Pass | Pass |
| Impossible amount of text | Reports "cannot fit"; export blocked | Pass | Pass |

**Result: 82 / 82 pass:**
- 16 type-only, all fitting.
- 66 with a photo: 62 fit, 2 tightened, 2 correctly cannot fit.

**Known open brand issue:** on the coral type-only Block, the SIS roundel's coral disc merges into the background. Behaviour is unchanged pending an approved alternative SIS mark (see `BRAND_DECISIONS.md`, B1). It isn't a layout failure, so the matrix doesn't flag it.

**Rules this matrix enforces:**
- **No photo → type-only.** The colour fills the canvas, the city tag and logos form a top bar (logos top-right), and the content sits at the bottom with the headline at 1.45× (feed) or 1.3× (banner).
- **Adding a photo** returns to the photo + panel composition. A loading or missing photo keeps the photo layout (no flicker; missing is visible and blocks export).
- **Headline:** text wraps naturally, and every line the person typed starts a new line. Nothing shrinks to preserve a line arrangement. The only pre-fit sizing is for a single word wider than the column.
- **Fit priority:** natural wrapping, then photo/panel share (feed photo 36% → 24%; banner panel 1 → 1.45), then spacing (to 72%), then headline size (floor 66% of base), then "cannot fit".
- **Details on Block are always Cards.**

**Progressive editing in the real editor (Chromium):**
- Blank → headline → date, time, venue, city → library photo → Nike: each appeared on the canvas immediately.
- Switching to banner reflowed the layout.
- Clearing time and venue removed their cards, and the headline moved down to use the freed space.
- Removing the photo restored the empty slot.

Unit tests (`tests/block.test.tsx`) cover the same structure in Node.

## All-template QA matrix (Phase 3b)

Live at `/qa/templates` (dev). Filters: `?template=slab,ticket`,
`?only=normal,long-venue`, `?format=feed|banner`, `?bare=1`, `?scale=0.5`.
`/qa/block` is the Block-only view. Results are on `window.__templateQA`.

**Fixtures:** 47, each in Feed and Banner for all 5 templates (470 cases):
- the Block list above
- details only
- long combination (long headline, venue, time and subheader with 4 logos), with and without a photo
- Broadsheet Tint and Colour backgrounds
- Slab Ink, with and without a photo
- absurd text (must fit or report)
- impossible text (must report "cannot fit")

**Automated checks per case (15):**
1. fit outcome
2. no text overflow
3. inside canvas
4. no overlap
5. SIS present
6. partner count
7. headline floor
8. no editor hints
9. logo plates match the setting
10. minimum spacing (12 units)
11. canvas size
12. square canvas corners
13. photo bounds
14. logos at a usable size
15. photo not distorted

**Result: 470 / 470 pass.** Fit outcomes:
- Broadsheet: 87 fit, 5 tightened, 2 cannot fit.
- Poster: 83 fit, 8 tightened, 3 cannot fit.
- Block: 88 fit, 4 tightened, 2 cannot fit.
- Slab: 88 fit, 4 tightened, 2 cannot fit.
- Ticket: 90 fit, 2 tightened, 2 cannot fit.

Every "cannot fit" is an impossible or absurd fixture.

**Visual review (browser):** all five templates in Feed and Banner, with and
without a photo. Hierarchy, spacing, cropping, logo placement, detail
treatment, headline size, negative space, alignment, internal soft corners and
square canvas corners were checked by eye. Fixed during review:
- Poster Banner's fade covered too much of the photo. It now has a shorter lead-in on banners.
- Dark logos vanished on the dark Poster and Slab no-photo grounds. A logo-legibility warning now names the fix (no automatic plate).

**Editor walkthrough (browser), all passing:**
- Blank launch: Content open, type-only Block.
- Headline, then date, time, venue and city: each appeared on the canvas immediately.
- Library photo: switched to the photo composition.
- Nike added.
- All five templates, each in Feed and Banner: content kept, exact size, square corners, correct detail style.
- Accent change.
- Time removed: detail gone. Photo removed: type-only, with the logo warning.
- Paper plate chosen: warning cleared.
- Save draft, then New creative: blank. Only template and format carried over; accent back to Coral; no logos or text.
- Saved draft reopened: fully restored.

**Unit tests:** `tests/templates.test.tsx` covers every template × format:
- blank start
- square root (no border-radius)
- export has no hints; the editor has them
- progressive population
- removal and reflow
- 0–4 logos with no plates
- the fixed detail style
- absolute-position whitelist
- template switching
- Feed ↔ Banner switching
- logo-tone warnings

`tests/design-system.test.ts` enforces the radius system.

## Export QA (Phase 3c)

**Browser harness** `/qa/export` runs the real pipeline (the same one as the
Download button) and decodes every PNG. Cases:
- 5 templates × Feed and Banner × 8 states: normal with photo, no photo, 4 logos on Paper plates, long combination, minimal content, royal-blue accent, Broadsheet Colour background, Slab Ink with no photo.
- The impossible-text case for each template and format, which must be refused.
- Real uploads (blob: photo plus transparent SVG logo) on Broadsheet and Poster.

**Checks per export:**
- exactly 1080 × 1350 or 1600 × 1000
- PNG
- all four corners fully opaque (the canvas is square, not rounded)
- real content (multiple colours)

**Result: 92 / 92 pass:**
- 80 exports
- 10 refusals with "There's more text than fits…"
- 2 upload exports

**Visual check of exported PNGs:**
- Bricolage and Inter Tight are embedded (no fallback).
- Transparent PNG and SVG logos render cleanly, including on plates.
- Uploaded photos render with the on-screen crop.
- Fades, slabs, ledgers, tags and soft internal corners match the canvas.

**Editor (Download button) checks**, with the final link click intercepted to
inspect the file instead of saving it:
- **Blank creative:** disabled, "Fix the items marked 'Needed' below to download".
- **Block Feed, no photo:** `SIS_Bangalore_12-Oct-2026_Block_Feed.png`, 1080 × 1350 PNG.
- **Poster Banner, photo + Nike:** `SIS_Bangalore_12-Oct-2026_Poster_Banner.png`, 1600 × 1000 PNG. The low-res photo warning stayed visible and didn't block.
- **Impossible text:** disabled, with the "more text than fits" reason. Re-enabled once the text was shortened.

**Unit tests** (`tests/export.test.ts`):
- filename format, omission of missing parts, all templates and formats, Mac/Windows-safe sanitising
- date parsing and year inference
- the download gate: complete, no-photo, missing optional fields, logo warning (allowed), cannot-fit, no headline, missing file, still loading (blocked)

**Background tabs:** exports finish, but browsers throttle timers there,
so they're slower (about 30 s versus about 1 s in a visible tab).

## Website outputs QA (Banner + Listing)

`/qa/web` renders 87 cases as exported (Banner 44, Listing 43). Each Banner
also runs the shared 15 layout checks. The website checks are:

- **Size and renderer:** exactly 1600 × 1000, rendered by the output's own
  renderer (no template).
- **Photo:** drawn once at its own aspect ratio, at the planned size. The
  crop/fit choice follows the Auto rule. A crop covers the frame; a whole
  photo stays entirely in frame, with the extension ready.
- **Banner:** the arc is present, SIS coral, anchored top-right, and between
  its minimum and maximum size. Every piece of info is inside the ellipse,
  the logos are clear of it, and the text is ink.
- **Listing:** no arc, no text and no logos.
- **Review:** a photo is required.

Cases cover:

- **Content combinations:** photo only; + headline; + details (reference);
  + logos; everything.
- **Long text:** long venue (wraps under its value column); long headline
  with 4 logos.
- **Photo shapes:** square → whole photo; 3:2, 4:3, 16:9 → crop; forced
  Fill frame and forced Whole photo; portrait positioned left; zoom 1.8
  from the top-left; panorama 4:1; tower 1:5; a tiny 200 × 150 photo
  (low-res warning).
- **Shared matrix:** every photo case from the template matrix.
- **Must fail:** an impossible Banner (18-line headline), which must report
  cannot fit.

`/qa/export` adds 25 real PNG exports: 12 states × 2 outputs, plus the
impossible Banner, which must be refused. Each PNG is checked for exact
size, opaque square corners and content. The Banner's top-right pixel must
be coral (#EF6033), and the Listing's must not.

The full-size exports were reviewed visually: reference details, full
content, long venue, and a square photo on the Listing.

Known limits:

- No subject detection: Auto decides from the aspect ratio only.
- The extension is a soft colour field, not generated scenery, so on busy
  photos the seam is visible as a change from detail to soft.
- On a crop, the Banner arc covers the photo's top-right corner by design;
  the focal point controls what sits there.

## Text colours and Creative Library QA

- **`/qa/templates`:** each template and format adds three cases, now 500
  in total:
  - every block a different colour, with logo plates;
  - no photo with a long venue;
  - a headline set in the colour of its own ground, which must be flagged.

  Checks:
  - every overridden block shows exactly its chosen colour;
  - no other block is marked as overridden;
  - the expected low-contrast block is flagged by the same measurement the
    Review uses.
- **`/qa/web`:** Banner labels and values coloured independently; a coral
  headline on the coral arc is flagged; the Listing draws no text.
- **`/qa/export`:** every text-colour case is exported twice, with and
  without its colours.
  - Instagram and Banner PNGs must differ, which proves the colours reach
    the file.
  - Listing PNGs must be identical.
  - The content heuristic now samples a 40 × 40 grid. The old 12 × 12 grid
    could miss all the text on a plain no-photo ground.
- **Unit tests (`tests/creative-library.test.ts`):**
  - two browsers share one library: save, reopen in another browser with
    files transferred, the "change the venue" edit with Save changes and the
    earlier version kept, and Save as new;
  - version conflicts, and no duplicates from editing;
  - an unshareable asset refused, a file shared once, local deletion
    harmless, and a missing team file opening as "missing" with download
    blocked;
  - search and every filter, the 30-day default and grouping;
  - the session flow;
  - Supabase mapping and errors.
- **Unit tests (`tests/text-colours.test.tsx`):**
  - unchanged markup when nothing is set;
  - every role in every template and state changes alone;
  - several overrides at once, and Auto restoring exactly;
  - date and day colouring separately;
  - template and output switching;
  - draft and library persistence;
  - the contrast warning and its wording.

## Results

| Template | Feed | Banner |
|---|---|---|
| Block | 47 / 47 | 47 / 47 |
| Broadsheet | 47 / 47 | 47 / 47 |
| Poster | 47 / 47 | 47 / 47 |
| Slab | 47 / 47 | 47 / 47 |
| Ticket | 47 / 47 | 47 / 47 |
