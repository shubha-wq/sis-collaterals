# Creative Library

The Creative Library is the team's shared, editable record of saved creatives.
Anyone on the team can find a creative from the last month, open it, change it
and download it again: the same photo, template, logos, colours and framing.

It is separate from **Drafts**, which stay in one browser.

|  | Drafts | Creative Library |
|---|---|---|
| Where it's stored | This browser (IndexedDB) | Supabase (Postgres + Storage) |
| Who can see it | Only this browser | Everyone on the team list |
| How it saves | Save draft, then autosave | Only when you click Save to Library, Save changes or Save as new |
| Used for | Work in progress | Finished creatives, and edits to them later |

## Setup (one time, by an admin)

1. **Create a Supabase project** at supabase.com. The free tier is enough.
2. **Run the SQL.** Open Supabase → SQL editor, paste
   `supabase/migrations/20261007000000_creative_library.sql`, and run it. It
   creates:
   - the `creatives`, `creative_versions` and `team_members` tables;
   - the `save_creative_changes` function, which saves changes and keeps
     history;
   - row-level security, so only team members can read or write;
   - the private `creative-assets` storage bucket and its policies.

   It is safe to run again.
3. **Add the team.** In the SQL editor, run (with lowercase emails):
   ```sql
   insert into public.team_members (email) values
     ('someone@sistersinsweat.in'),
     ('another@sistersinsweat.in');
   ```
   To remove someone later, use `delete from public.team_members where email = '…';`.
4. **Allow sign-in links back to the site.**
   - In Supabase → Authentication → URL Configuration, set **Site URL** to the
     production URL. Add each deploy URL (and `http://localhost:5173` for local
     development) to **Redirect URLs**.
   - Email sign-in (magic link) is on by default. For more than a handful of
     sign-ins a day, add a custom SMTP sender under Authentication → Emails.
5. **Set two environment variables** in Vercel or Netlify (and in `.env.local`
   for local development; see `.env.example`):
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
   Both are in Supabase → Project Settings → API. The anon key is meant to be
   public; the row-level security rules are what protect the data. Never
   use the `service_role` key in this app.
6. **Redeploy.** Vite reads these variables at build time.

**Without these variables:**
- A production build shows "The Creative Library isn't set up yet" and
  everything else works as before.
- The dev server uses an **in-memory preview library**. It is clearly
  labelled "preview · not shared", lives in that one tab and is cleared on
  reload. It exists only so the flow can be tried locally.

## How the team uses it

- **Open Creative Library** (in the bar under Drafts) shows creatives
  saved in the **last 30 days**, newest first, grouped by day.
  - Each card shows a preview, headline, city, event date, venue, output
    type, template, created date, last-edited date (and by whom) and the
    version.
  - Search covers the headline, venue and city. You can filter by city,
    output type, template, and date range (7, 30 or 90 days, or all time).
- **First use:** enter your team email, then click the one-time link in the
  email. You stay signed in in that browser.
- **Open / Edit** loads the creative exactly as saved, including its output,
  template, photo and framing, logos and plates, colours, per-block text
  colours and every manual setting. It behaves like any current creative.
- **Save to Library** adds a creative that isn't in the library yet.
- **Save changes** updates the creative you opened. The version it replaces
  is kept, under **Earlier versions** on its card. If a teammate saved the
  same creative after you opened it, your save is refused rather than
  overwriting theirs. Use **Save as new** to keep yours.
- **Save as new** creates a separate creative and leaves the original
  untouched.
- Nothing is ever saved to the library automatically, so editing never
  creates duplicate records. The library bar shows "unsaved changes" until
  you save.
- **Opening an earlier version** loads it for editing. Save changes then
  makes it the current version, and the version it replaces is kept too.

## What is stored

- **`creatives`:** one row per creative.
  - `project` (jsonb) holds the complete structured `Project`, never an
    image. It covers content (headline, subheader, date, day, time, venue,
    city, notes), output, format, template, accent, photo reference with
    focal point and zoom, website framing per output, partner logo
    references, logo plate, all overrides (ground, slab colour, headline
    size, all-text colour, logo size) and per-block text colours. The SIS
    logo is fixed by the app and always drawn.
  - The columns `output`, `template`, `headline`, `event_date`, `event_day`,
    `city` and `venue` are copied out of the project at save time, for
    listing and search.
  - It also records `version`, `created_at` / `created_by`, `updated_at` /
    `updated_by`, and `thumbnail_path`.
- **`creative_versions`:** the previous versions, written by Save changes.
- **Storage `creative-assets`:**
  - `blobs/<sha256>` holds each uploaded photo or logo file used by any
    saved creative.
  - `thumbs/<creative id>/<time>.jpg` holds the 480 px list previews, made
    with the real export pipeline.

## Asset lifecycle

- **References, not copies.** A creative refers to images by
  `ImageSource`:
  - Built-ins (the SIS logo, Nike, SIS library photos) are referenced by id
    and ship with the app, so every browser already has them.
  - Uploads are referenced by `blobId`, the SHA-256 of the file. The same
    file always has the same id, in every browser and in team storage, so it
    is stored once for the whole team however many creatives use it.
- **AI landscapes:** the generated website landscape (`photo.expansion`) is
  a derived file and is shared exactly like an upload. A reopened creative
  reuses it instead of paying for a new generation.
- **On save:** every upload the creative uses is copied to team storage if
  it isn't there yet. If a file can't be shared, the save stops with a
  message to re-upload it, and nothing half-broken is stored. This happens
  when the file is no longer in this browser and isn't in team storage
  either.
- **On open:**
  - Any team file this browser doesn't have is downloaded into the
    browser's own blob store first, so the editor and export work exactly as
    usual.
  - If a file is genuinely missing from team storage, which can only happen
    if someone deletes it in the Supabase dashboard, the creative still
    opens. The image shows as "missing — re-upload" and Download is blocked
    until it's replaced.
- **Deleting from your logo or photo library** removes only that browser's
  picker entry. It never touches team storage or any saved creative.
- **The app never deletes or overwrites anything in team storage.** There
  are no update or delete permissions on the bucket.

## Retention

The library shows the last 30 days by default. **Nothing is deleted.**
Older creatives, earlier versions and their files stay stored, and the "All
time" range shows them.

No automatic deletion or archiving is implemented. If storage ever needs
trimming, the policy (for example "delete creatives not edited in 12 months,
and files no remaining creative uses") must be agreed first and then run
deliberately. It would not happen silently.

## Access model

- People sign in with a one-time email link: no passwords and no accounts to
  manage beyond the `team_members` list.
- Every table and the storage bucket use row-level security that checks the
  signed-in email against `team_members`.
- Signing in works for any address, but only listed addresses can see or
  save anything. Others get "Your email isn't on the team list".
- There are no per-creative permissions. Everyone on the team can open and
  save every creative, and history protects against accidental overwrites.
