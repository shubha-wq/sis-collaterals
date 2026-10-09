# SIS Collaterals

The Sisters in Sweat marketing collaterals generator, covering event
creatives (Instagram Creative 1080 × 1350, Website Banner and Website Listing
1600 × 1000) and Week Ahead schedule sheets. It's a static web app with no
install for users. The backend pieces are optional: the shared Creative
Library (Supabase) and one small server function for AI background expansion
(`/api/expand-image`).

## Develop

Requires Node 20.19 or later.

```bash
npm install
npm run dev        # http://localhost:5173  (QA grid at /qa)
```

## Build and preview

```bash
npm run build      # type-check, then build to dist/
npm run preview    # serve dist/ at http://localhost:4173
npm test           # unit tests
```

## Deploy

- **Vercel:** import the repo. `vercel.json` sets the build command, the
  `dist` output and the SPA rewrite.
- **Netlify:** import the repo. `netlify.toml` sets the build command,
  `dist`, Node 22 and the SPA redirect.

To expose `/qa` on a deployment, set `VITE_ENABLE_QA=true` in the host's
environment variables.

**AI background expansion (Website Banner / Listing):** set the server-only
`STABILITY_API_KEY` (see `docs/AI_IMAGE_EXPANSION.md`). Without it, a portrait
photo's sides use a soft edge fill and the editor says so.

**Creative Library (shared):** set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (see `.env.example`), after the one-time Supabase
setup in `docs/CREATIVE_LIBRARY.md`. Without them, the editor works as before
and the library shows setup instructions.

## Docs

- `docs/ARCHITECTURE.md`: modules, storage design, build phases
- `docs/EDGE_CASES.md`: the template test matrix
- `docs/AI_IMAGE_EXPANSION.md`: AI outpainting for the website outputs (setup, integrity, caching)
- `docs/DEPLOYMENT.md`: publishing to Vercel, and how local drafts stay safe across updates
- `docs/CREATIVE_LIBRARY.md`: the shared library's setup, saving rules, asset lifecycle and retention
- `docs/ASSET_CATALOGUE.md`: production assets, and the 47 unused original uploads awaiting decisions
- `docs/BRAND_DECISIONS.md`: brand decisions made, and open brand-asset questions
- `docs/reference/original/`: the untouched original project. Reference only;
  it's never bundled.
