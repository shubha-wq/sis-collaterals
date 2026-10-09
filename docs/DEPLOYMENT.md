# Deploying SIS Collaterals (Vercel) and keeping drafts safe

## Where data lives (and why deployments can't erase it)

| Data | Where | Touched by a deployment? |
|---|---|---|
| App code and built assets | Vercel (`dist/`, built from the repo) | Yes, replaced on every deploy |
| Local drafts, uploaded logos and photos, generated landscapes | IndexedDB `sis-collaterals` in each person's browser, per site address | **No.** It never leaves the browser and isn't part of the build |
| Creative Library (optional) | Supabase | No (separate service) |

- A deployment only replaces files on Vercel. The app never deletes the
  database or clears a store, and a test checks this on every run
  (`tests/draft-safety.test.ts`).
- Database upgrades only add stores.
- Saved drafts are upgraded **on read** (`src/model/migrate.ts`): missing
  fields get safe defaults, unknown fields are kept, and nothing is rewritten
  until the person edits.
- A draft that can't be read safely (for example, saved by a newer version)
  is left untouched. The editor shows "A saved draft couldn't be opened"
  with a "Download a recovery copy" option.

### Rules for future changes

- Never delete or clear an IndexedDB store, and never call `deleteDatabase`.
  Only add stores, in `src/persistence/idb.ts`.
- Changing the shape of `Project`:
  1. bump `SCHEMA_VERSION`;
  2. add a step to `STEPS` in `src/model/migrate.ts`;
  3. give new fields safe defaults in `withDefaults`;
  4. add a test that an old record still opens.
- Run `npm run release-check` before every release (typecheck, tests,
  production build). Also run `/qa/templates`, `/qa/web` and `/qa/export`
  on a Preview deployment, or locally.

## What teammates should know

- **Drafts belong to one browser on one site address.** The production URL,
  each Preview URL and `localhost` each have their own drafts. **Keep the
  production domain stable**: moving to a new domain means drafts stay
  behind at the old one. To move a creative between browsers or addresses,
  use **Drafts → Export this creative** (a project file with its photos and
  logos) and **Import project file…** on the other side. Or use the Creative
  Library once it's set up.
- **Saving:**
  - "Save draft" stores the creative in this browser. After that, every
    change saves automatically within about half a second.
  - The bar shows **Saving… / Saved / Save failed**.
  - On **Save failed** your changes are still on screen; click **Retry**.
- **A creative that has never been saved as a draft exists only in that
  tab.** The app warns before closing the tab or starting a new creative.
- **New versions:**
  - After a deployment, an open tab keeps running the old version until it's
    refreshed. Saved drafts are safe across the refresh. Check the bar says
    **Saved** first.
  - If a newer version is opened in another tab, the old tab can no longer
    save. It says so ("Reload this tab to keep working"), and reloading is
    safe.
- **Browser data:**
  - Clearing site data, using a private or incognito window, or the browser
    evicting storage removes local drafts. The app asks the browser to keep
    its storage persistent when you save or upload.
  - Safari can still remove data for sites not visited for weeks. Export a
    project file for anything important, or use the Creative Library.

The app cannot promise that an edit made in the last moment before an abrupt
crash or forced close is kept. Saves happen within about half a second, and
the app tries to finish a pending save when the tab is hidden.

## Vercel settings (verified)

| Setting | Value |
|---|---|
| Framework preset | Vite (`vercel.json` sets it) |
| Install command | `npm install` (default) |
| Build command | `npm run build` (runs `tsc -b && vite build`) |
| Output directory | `dist` |
| Node.js version | 20.x or 22.x (package.json requires ≥ 20.19) |
| Client-side routes | `vercel.json` rewrites everything except `/api/*` to `index.html` |
| Serverless function | `api/expand-image.ts` (AI background expansion; answers "not configured" until a key is set) |

### Environment variables

**None are required.** The editor, drafts, project files and PNG downloads
work with no configuration.

| Variable | Needed for | Scope | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Shared Creative Library | Production (+ Preview if wanted) | See `docs/CREATIVE_LIBRARY.md`. Without them the library shows setup instructions. |
| `STABILITY_API_KEY` | AI background expansion for portrait photos on Website Banner / Listing | Production (+ Preview if wanted) | **Server-only**, never prefix with `VITE_`. Paid per generation. Without it the soft edge fill is used, with a warning. |
| `VITE_ENABLE_QA` | Exposes `/qa` pages | Preview only | Leave unset in Production. |

`VITE_` variables are baked in at build time: redeploy after changing them.

## Publish to Vercel: step by step

1. **Check locally:**
   ```bash
   npm install
   npm run release-check
   ```
   This must finish with all tests passing and "✓ built".
2. **Put the project in a Git repository** (GitHub, GitLab or Bitbucket),
   if it isn't already. Run these from the `sis-collaterals` folder:
   ```bash
   git init
   git add -A
   git commit -m "SIS Collaterals"
   ```
   Then create an empty repository on GitHub and push to it, following
   GitHub's "push an existing repository" commands.
   - `.env*` files and `dist/` are git-ignored; never commit keys.
   - `docs/reference/original` is reference material. It can be committed,
     but nothing in it is deployed.
3. **Import into Vercel:** vercel.com → Add New… → Project → import the
   repository.
   - Vercel reads `vercel.json`, so leave Build and Output settings as
     detected (`npm run build`, `dist`).
   - If the repository root isn't the `sis-collaterals` folder, set **Root
     Directory** to it.
4. **Environment variables:** skip them for now (none are required).
   Optionally add `VITE_ENABLE_QA=true` with **Preview** scope only. Click
   **Deploy**.
5. **Test a Preview first.** Make later changes on a branch, then push it:
   ```bash
   git checkout -b my-change
   git push -u origin my-change
   ```
   Vercel builds a Preview URL for the branch. On it:
   - open the editor, make a creative, Save draft and reload, and check it
     reopens;
   - download a PNG;
   - if QA is enabled there, run `/qa/templates`, `/qa/web` and
     `/qa/export`.

   Preview URLs have their own drafts (separate from Production).
6. **Release to Production:** merge the branch into `main` (or click
   **Promote to Production** on the tested Preview). Production deploys
   from `main`.
7. **Use one stable production address.** Use the `*.vercel.app` name, or
   add a custom domain under Project → Settings → Domains *before* the team
   starts saving drafts, and then keep it.
8. **Tell the team:** "Refresh to get the new version; saved drafts stay. If
   the bar says Save failed, click Retry before refreshing. Export a project
   file for anything you need to move between browsers."

Optional later:
- Add the Supabase variables to turn on the shared Creative Library.
- Add `STABILITY_API_KEY` to turn on AI background expansion.
- Redeploy after adding either.

With the Vercel CLI instead of Git: `npm i -g vercel`, then `vercel` (a
Preview deployment) and `vercel --prod` (Production), run in the project
folder.
