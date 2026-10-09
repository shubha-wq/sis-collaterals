# AI background expansion (Website Banner and Website Listing)

When a photo doesn't fit 1600 × 1000 without cutting someone out (portrait,
square, panorama), the website outputs show the **whole photo**. AI
outpainting generates **only the missing background** around it.

```
original photo (never modified)
   → placed at full height (or width), uniformly scaled
   → server asks the AI for background on the free sides only
   → one wider landscape (the "derivative"), stored as its own file
   → Website Listing and Website Banner each show a 1600 × 1000 window of it
   → the untouched original photo is drawn on top, exactly over its slot
   → Banner: + SIS arc + event details + logos (separate design layers)
```

## Setup (one time, by an admin)

The recommended provider is **Stability AI's Outpaint** endpoint (Stable
Image → Edit → Outpaint). It is built for this: you send the photo and how
many pixels to add on each side, and it returns the photo with only those
areas generated.

1. Create an account at platform.stability.ai and make an API key. Outpaint
   is billed per image (a few US cents per generation at the time of
   writing; check their pricing page).
2. In **Vercel** (Project → Settings → Environment Variables) or **Netlify**
   (Site configuration → Environment variables), add:

   | Variable | Value | Notes |
   |---|---|---|
   | `STABILITY_API_KEY` | `sk-…` | **Server only.** Never prefix with `VITE_`. |
   | `IMAGE_EXPANSION_PROVIDER` | `stability` | Optional. This is the default when the key is set. |
   | `STABILITY_OUTPAINT_CREATIVITY` | `0.35` | Optional, 0–1. Lower stays closer to the photo. |

3. Redeploy. The function is `api/expand-image.ts` (Vercel) and
   `netlify/functions/expand-image.mts` (Netlify), both served at
   `/api/expand-image`.
4. For local development, put the same variables in `.env.local`. The Vite
   dev server serves `/api/expand-image` with the same handler.

**The key never reaches the browser.** Only `VITE_`-prefixed variables are
bundled into the client, and the client only ever calls the app's own
`/api/expand-image`. The server never echoes the key, and it is redacted
from provider error messages.

### Without a provider

The endpoint answers "not configured" (501). The editor then:
- uses the old soft edge fill as an **emergency fallback only**;
- shows "AI background expansion isn't set up" under Photo, plus a warning
  in Review;
- still allows Download.

**Fill frame** (crop) never needs AI.

### Trying it without paying (development only)

`VITE_IMAGE_EXPANSION=mock npm run dev` uses a stand-in that fills the sides
with flat edge colour, striped and labelled "MOCK — not AI". It is for
testing the flow only. It is never used unless that variable is set at build
time.

## Protecting the original photo

- **The uploaded photo is never modified or overwritten.**
  - The browser sends the server a resampled copy of it at its placed size.
  - The generated landscape is stored as a separate file, with its own
    content hash.
  - Replacing the photo discards the old derivative.
- **On the creative, the original is always drawn on top of the
  landscape**, exactly over the slot where the AI kept its copy. So even if
  a model subtly altered a face or a hand inside the photo area, that change
  can never appear on the creative. Generated pixels are only ever visible
  outside the original photo.
- The prompt (`src/expansion/prompt.ts`) tells the model to keep every
  person, face, body, pose, garment and object unchanged and to generate
  only the background.
  - It forbids new or duplicated people, seams, mirrored backgrounds,
    patterns, text and watermarks.
  - Stability's outpaint takes a single prompt, so these restrictions are
    stated in it as an "Avoid:" list.
- **No stretching.** The photo and the landscape are only ever scaled
  uniformly. A provider result of the wrong shape is rejected, never
  stretched.

## Generated once, reused everywhere

- The derivative's key is the source photo plus the expansion geometry plus
  a version (`src/expansion/spec.ts`). Text, logos, text colours, the arc,
  the output type and the focus position are not part of it.
- The landscape is wide enough that **every** focus position fits inside
  it. So moving the photo left or right, and switching between Listing and
  Banner, never calls the AI again.
- The derivative is recorded on the project as `photo.expansion`: a file
  reference plus geometry. It is saved with Drafts and shared through the
  Creative Library, like any uploaded file. A reopened creative reuses it.
- One request per key at a time. A failure is not retried automatically;
  **Try again** under Photo retries it.

## States in the editor

- **Generating landscape image…** shows under Photo, and on the canvas as
  "Generating Website Banner…" or "Generating Website Listing…". You can
  keep editing anything. Download for that output is disabled until the
  landscape is ready.
- **Ready** shows "Background extended with AI (provider)".
- **Failed — reason** offers a Try again button. The original photo is
  kept, and Download stays disabled; Fill frame is the alternative.
- **Not set up** uses the fallback, as above.

## Replacing the provider

Implement `ImageExpansionProvider` (`server/expansion/provider.ts`) and
return it from `selectProvider()` in `server/expansion/handler.ts`.

The client contract stays the same:
- **Request:** POST multipart with `image`, `left`, `right`, `up`, `down`,
  `outputWidth`, `outputHeight`, `instructions` and `negative`.
- **Response:** the image.

## Limitations

- I couldn't test the Stability adapter against the live API here; no key
  was available. It is unit-tested against a stubbed HTTP layer. Check the
  first real generations after setting the key.
- Generation quality depends on the provider. A busy or unusual background
  can produce an imperfect continuation. Fill frame and the focus sliders
  remain available, and the original subjects are always shown exactly as
  photographed, because of the overlay rule.
- Each generation is a paid call. The cache avoids repeats, but a new photo
  (or a new photo size) costs one call.
- Vercel limits function responses to about 4.5 MB, so the landscape is
  requested as JPEG. The original photo on top stays at full quality.
