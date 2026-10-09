# Asset catalogue

## Production assets (bundled with the app)

Added in Phase 2. Everything else stays in `docs/reference/original/` only.
These live in `src/assets/library/` and are registered in
`src/assets/catalog.ts`. Vite fingerprints each file, and a browser downloads
a photo only when a creative uses it.

### Logos (2)

| File | Role | Source |
|---|---|---|
| `logos/sisters-in-sweat-roundel-coral.png` | SIS, required on every creative, can't be removed | `reference/original/assets/logos/`, byte-identical copy (803 × 796, transparent) |
| `logos/nike-swoosh-black.png` | The one built-in partner | `reference/original/assets/logos/`, byte-identical copy (370 × 370, transparent) |

There's no Hive Club logo or any other partner. Users upload everything else.

There's no alternative SIS mark (for example for coral or dark grounds) anywhere in
the reference assets. See `BRAND_DECISIONS.md`, B1.

### Photos (17): the original tool's photo library, nothing more

| File | Size | Source |
|---|---|---|
| `photos/padel-hive-club.jpg` | 1066 × 1600 | `assets/photos/padel-hive-club.jpeg`, byte-identical |
| `photos/run-cubbon-park-street.jpg` | 720 × 1280 | `assets/photos/run-cubbon-park-street.jpeg`, byte-identical. **Low resolution**, see decisions |
| 15 more `photos/*.jpg` | 1600 × 1000–1066 | The 15 `uploads/*.png` the old `PHOTOS` list used, renamed kebab-case and converted PNG → JPEG at quality 90 |

The PNG → JPEG conversion cut the photo payload from about 50 MB to 8.6 MB.
The photos have no transparency to lose, and creatives export at 1080 px wide
or less from 1600 px sources. The untouched PNGs remain in
`reference/original/uploads/`.

### Fonts (8 files)

Bricolage Grotesque, Inter Tight (plus italic) and Pacifico, Latin + Latin
Extended, as variable WOFF2 in `src/design-system/fonts/`, with their OFL
licences. The original project had no font files (it loaded Google Fonts at
runtime). These were downloaded once from Google Fonts and are now served by
the app itself.

### Candidates not added

| Group | Status |
|---|---|
| 9 clean photos (group 2 below) | Not added. Waiting for your pick |
| 2 WhatsApp "originals" (group 3) | **Byte-identical to two photos already in the library**, so there's nothing to add |

---

# Unused upload catalogue

The original project's `uploads/` folder holds 62 files. The old tool's photo
library referenced 15 of them. The other **47 are catalogued here**. Nothing
has been deleted, and none of them ship in the production build.

- Location: `docs/reference/original/uploads/` (an untouched copy of the
  original zip, 146 MB in total).
- Bundling: Vite only bundles files imported from `src/` or placed in
  `public/`. `docs/` is never bundled.
- No two of the 47 are byte-identical to each other. Three are byte-identical
  to files already in the library (`SIS.png` and both WhatsApp images).
  Several are near-duplicates, noted below.
- Every photo is 1600 × 1000 or 1600 × 1066 unless a size is given.

Decision column: **TBD** until you choose. Suggested options are Keep (add to
the app library), Archive (keep in `docs/reference` only) or Delete.

## 1. Finished past creatives (20)

These are event photos with the coral date/time/venue bubble already baked
in (top-right). They're output from the old workflow, not source photos.
Useful as visual reference; unsuitable as library photos because the overlay
would clash with the new templates.

| File | Event | Decision |
|---|---|---|
| `Banner  Baddy game night.png` | Badminton game night | TBD |
| `Banner BASKETBALL BEGINNER 8-9_30 PM _ ST. JOSEPHS UNIVERSITY, LANGFORD.png` | Basketball beginner, St. Joseph's | TBD |
| `Banner Football Beginner - Bullring, Indira Nagar.png` | Football beginner, Bullring | TBD |
| `Banner Football sisters & misters game day SUFC ulsoor.png` | Football S&M game day, SUFC | TBD |
| `Banner RUN WITH THE SISTERS 6_45-8_15 AM _ CUBBON PARK.png` | Run, Cubbon Park | TBD |
| `Banner SIS X GREAT GOALS_ Football coaching (beginners).png` | SIS × Great Goals football | TBD |
| `Banner SIS x Double Dribble _ Basketball beginner coaching.png` | SIS × Double Dribble basketball | TBD |
| `Banner SPECIALISED PILATES WORKSHOP AT Pilates Academy, Koramangala.png` | Pilates, Koramangala | TBD |
| `Banner SPORT BADMINTON MATCH DAY 11-1 PM Game Theory, Double Road _ EFF_14.png` | Badminton match day, Game Theory | TBD |
| `Banner SPORT BASKETBALL BEGINNER 8-9_30 PM _ ST. JOSEPHS UNIVERSITY, LANGFORD.png` | Basketball beginner, St. Joseph's (second version) | TBD |
| `Banner SPORT FOOTBALL S&M GAME NIGHT_ 8-9_30 PM _ RUSH ARENA, COOKE TOWN.png` | Football S&M game night, Rush Arena | TBD |
| `banner Functional fitness with Harry's Fitcamp.png` | Functional fitness, Harry's | TBD |
| `banner SISTERS & MISTERS YOGA 8_30-9_45 AM _ CUBBON PARK.png` | S&M yoga, Cubbon Park | TBD |
| `Badminton HSR (2).png` | Badminton, SS Sports HSR (bubble version of a library photo) | TBD |
| `Football Beginner - Jakkur (2).png` | Football, TSUS Jakkur (bubble version of a library photo) | TBD |
| `S&M ACRO YOGA WORKSHOP DHURII ACADEMY OF ARTS, DOMLUR (2).png` | Acro yoga, Dhurii (bubble version of a library photo) | TBD |
| `SPORT BASKETBALL S&M GAME NIGHT_ 8-9_30 PM _ ST. JOSEPHS UNIVERSITY, LANGFORD (2).png` | Basketball S&M game night (bubble version of the clean photo in group 2) | TBD |
| `SPORT RUN WITH THE SISTERS 6_45-8_15 AM _ CUBBON PARK (3).png` | Run, Cubbon Park (bubble version) | TBD |
| `Sport _ Basketball beginner (2).png` | Basketball, Chaos Adyar (bubble version of a library photo) | TBD |
| `Workshop _ SIS x The Pilates Studio- Chennai by Namrata Purohit (2).png` | Pilates Studio Chennai (bubble version of the clean photo in group 2) | TBD |

## 2. Clean event photos not yet in the library (9)

No overlays. These are the best candidates to add to the built-in photo library.

| File | Subject | Decision |
|---|---|---|
| `BASKETBALL BEGINNER 8-9_30 PM _ ST. JOSEPHS UNIVERSITY, LANGFORD.png` | Three players on an outdoor court, close action | TBD |
| `Football Package Chennai.png` | Women's football on turf, bibs | TBD |
| `SPORT BASKETBALL S&M GAME NIGHT_ 8-9_30 PM _ ST. JOSEPHS UNIVERSITY, LANGFORD.png` | Mixed basketball, indoor hall | TBD |
| `SPORT FOOTBALL S&M GAME NIGHT_ 8-9_30 PM _ RUSH ARENA, COOKE TOWN.png` | Mixed football match on grass | TBD |
| `SPORT RUN WITH THE SISTERS 6_45-8_15 AM _ CUBBON PARK (2).png` | Two runners on a park road (clean version of the group 1 run) | TBD |
| `Sport SIS X GREAT GOALS_ Football coaching (beginners).png` | Football drill on a caged pitch | TBD |
| `Sport SIS x Double Dribble _ Basketball beginner coaching.png` | Portrait: player in Lakers jersey with ball | TBD |
| `Sport _ Baddy game night.png` | Badminton player mid-swing, indoor | TBD |
| `Workshop _ SIS x The Pilates Studio- Chennai by Namrata Purohit.png` | Pilates class with resistance bands | TBD |

## 3. Originals of current library photos (2)

| File | Size | Notes | Decision |
|---|---|---|---|
| `WhatsApp Image 2026-09-16 at 5.44.49 PM.jpeg` | 1066 × 1600 | Padel serve, blue court. **Byte-identical** to `assets/photos/padel-hive-club.jpeg` (already in the app) | TBD |
| `WhatsApp Image 2026-09-22 at 3.58.22 PM.jpeg` | 720 × 1280 | Runners on a tree-lined road. **Byte-identical** to `assets/photos/run-cubbon-park-street.jpeg` (already in the app). Low resolution, and no larger original exists here | TBD |

## 4. City title image (1)

| File | Notes | Decision |
|---|---|---|
| `Bangalore city banner(1).png` | Group photo with "BANGALORE" set in large type over it. Text-on-photo version of the library's city photo | TBD |

## 5. Logos (4)

| File | Size | Notes | Decision |
|---|---|---|---|
| `Logo Black@2x.png` | 2687 × 753, transparent | Hive Club wordmark, black. Probably the same artwork as `assets/logos/hive-club-*.png` | TBD |
| `Logo Lime Green@2x.png` | 2687 × 753, transparent | Hive Club wordmark, lime | TBD |
| `Logo White@2x.png` | 2687 × 754, transparent | Hive Club wordmark, white | TBD |
| `SIS.png` | 803 × 796, transparent | SIS roundel, white script on coral. **Byte-identical** to `assets/logos/sisters-in-sweat-roundel-coral.png` (already in the app) | TBD |

Per the agreed plan, no Hive Club logo becomes a built-in partner. People
upload partner logos to their own library instead.

## 6. Week Ahead references (3)

| File | Size | Notes | Decision |
|---|---|---|---|
| `BLR.png` | 1080 × 1350 | Bangalore Week Ahead sheet, earlier paper design | TBD |
| `CHE.png` | 1080 × 1350 | Chennai Week Ahead sheet, earlier paper design | TBD |
| `Screenshot 2026-09-22 at 1.37.08 PM.png` | 788 × 262 | Crop of a Week Ahead sheet where "11:30 – 12:30 PM" runs into the event name. A bug report; it's the case the current time-column rule fixes. Add to `EDGE_CASES.md` | TBD |

## 7. Third-party design inspiration (7)

Schedule posters from other brands. Reference only. Don't ship them, and
check usage rights before reusing any idea directly.

| File | Size | Notes | Decision |
|---|---|---|---|
| `5ce56dd100fae1d7252c30e9b1fcac7c.jpg` | 1200 × 1500 | Dark schedule list with lime accents | TBD |
| `5ce56dd100fae1d7252c30e9b1fcac7c-50db4548.jpg` | 1200 × 1500 | Re-saved copy of the above | TBD |
| `737eaf92cc385caa5a755e3880f88f85.jpg` | 1132 × 1600 | "Festival Schedule" poster, red-orange | TBD |
| `737eaf92cc385caa5a755e3880f88f85-6788d237.jpg` | 1132 × 1600 | Re-saved copy of the above | TBD |
| `c40fd0f9137e27bb2eef5ec179b27fec.jpg` | 1200 × 1500 | "APR" monthly calendar poster | TBD |
| `c40fd0f9137e27bb2eef5ec179b27fec-0f3edc10.jpg` | 1200 × 1500 | Re-saved copy of the above | TBD |
| `ed35da2655bd153924fee15bd04efeb2.jpg` | 1080 × 1350 | "Rundown" schedule list | TBD |

## 8. Website reference (1)

| File | Size | Notes | Decision |
|---|---|---|---|
| `Screenshot 2026-09-23 at 2.22.13 PM.png` | 2880 × 1320 | SIS website event card: "SIS × Langur Rock Climbing Workshop" with the coral date bubble | TBD |

## Totals

| Group | Files |
|---|---|
| 1. Finished past creatives | 20 |
| 2. Clean photos not in library | 9 |
| 3. Originals of library photos | 2 |
| 4. City title image | 1 |
| 5. Logos | 4 |
| 6. Week Ahead references | 3 |
| 7. Third-party inspiration | 7 |
| 8. Website reference | 1 |
| **Total** | **47** |
