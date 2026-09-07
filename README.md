# Golf Meme Digest generator

Drop in a photo, add a steer if you want one, and get back several finished
memes — Claude writes the joke *and* designs the layout. Pick one, nudge the
text, download it.

## How it works

1. **The browser** downsizes your photo to 1024px and posts it to `/api/generate`.
2. **The route handler fans out one Claude call per variant, in parallel.** Each
   call draws its own 2-3 past memes at random from your Vercel Blob store and
   passes them to Claude by URL. Different references mean the variants are four
   independent attempts rather than four rewrites of one idea — and each variant
   shows which posts shaped it.
3. **Claude returns a layout**, not just words: where each run of text sits, how
   big, which typeface, what colour, whether the canvas gets a solid band above
   or below the photo.
4. **The browser draws it** on a canvas over your full-resolution photo. Drag any
   text to move it, change the words, nudge the size, then download.

There is no catalogue file and no ingest step. Put images in `reference/`,
commit them, done.

Each run reports what it cost — requests, tokens in and out, and dollars — under
the Generate button, with a running total for the session.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY into it
npm run dev
```

Open http://localhost:3000.

Then upload your past memes (see below). Without them the app still works — it
falls back to the voice rules in `lib/claude.ts` — but it will not sound or look
like your account.

## The style reference

Your past memes live in a Vercel Blob store. Upload a folder of them once:

```bash
npm install                             # the script needs tsx, from devDependencies
npx vercel env pull .env.local          # fetches BLOB_READ_WRITE_TOKEN
npm run upload -- ./posts --dry-run
npm run upload -- ./posts
```

Windows works — the progress bar falls back to ASCII on the legacy cmd.exe and
PowerShell 5 consoles, which cannot render block characters. Relative paths,
absolute paths and `~` all work.

The script walks the folder (one level — sub-folders are reported, not
descended), takes JPEG/PNG/WebP only, skips videos and everything else, resizes
each to 1080px on the long edge, and uploads with a progress bar. Re-running is
a cheap no-op: it lists the store first and skips anything already there, so
adding new memes later just means running it again.

| Flag | Effect |
| --- | --- |
| `--dry-run` | List what would be uploaded, touch nothing |
| `--limit 100` | Only upload the first 100 new files |
| `--concurrency 12` | Parallel uploads, default 8 |
| `--no-resize` | Upload the originals untouched |
| `--force` | Re-upload files already in the store |

### Making the store live in the app

There is no code change — the app switches to Blob as soon as it can see a
token.

```bash
npx vercel link                  # once
npx vercel env pull .env.local   # writes BLOB_READ_WRITE_TOKEN
npm run dev
```

In production, connect the Blob store to the project (Vercel → Storage → your
store → Connect Project) and redeploy once. Vercel supplies credentials in one
of two shapes and the app accepts either: the classic `BLOB_READ_WRITE_TOKEN`,
or `BLOB_STORE_ID` plus a per-deployment `VERCEL_OIDC_TOKEN`.

Confirm with `/api/health`: `blobConfigured` should be `true`,
`referenceSource` `"blob"`, and `referenceImages` should match your upload
count. If it is 0, `referenceError` in the same response says why.

New uploads are picked up within about five minutes with no redeploy — the app
lists the store at request time and caches that listing.

## Rating what comes back

Every generated meme has Like and Dislike buttons. A vote moves the odds of the
2-3 reference memes that produced that variant: liked references get drawn more
often, disliked ones less.

- **Score.** Each reference starts at 0. A like adds +1 to every reference
  behind that variant, a dislike -1. Tapping the same button again takes the
  vote back; flipping like to dislike moves it by two.
- **Weight.** `exp(FEEDBACK_LEARNING_RATE × score)`, clamped to 0.1x-10x. At the
  default rate of 0.35, five consistent likes make a reference roughly 5.8x more
  likely to be drawn and five dislikes about 0.17x — measured over 4,000 draws.
- **Nothing is ever excluded.** The floor keeps a disliked reference in the
  running at long odds, so it can still prove the votes wrong.

Credit assignment is deliberately crude: three references made the meme and all
three get the same credit, even though probably only one of them was
responsible. Over many votes the noise averages out. If you want it to learn
faster and noisier, raise `FEEDBACK_LEARNING_RATE`.

Scores live in `meta/weights.json` in the same Blob store, so there is no second
service to set up. Delete that file to reset all learning.

Blob URLs are public but unguessable, which is what lets Claude read them
directly and the browser show the "styled on" thumbnails. For memes you already
posted publicly that is fine; do not put anything private in that store.

If `BLOB_READ_WRITE_TOKEN` is not set, the app falls back to reading the local
[`reference/`](reference/README.md) folder, so a fresh clone runs without any
cloud setup.

## Formats

The composer offers four:

| Choice | What it makes |
| --- | --- |
| **Auto** | Claude picks, including treatments none of the named formats cover |
| **Old school** | Impact caps over the photo, no bands, setup top and punchline bottom |
| **Modern** | Small light sans laid over an empty part of the frame, sentence case |
| **Fill in the blank** | A line with a literal `____` the reader completes |

Each is a concrete layout brief in `lib/claude.ts` — positions, font, weight and
size ranges — not just a word in the prompt, so the output looks like the format
rather than approximating it.

## The layout system

Claude gets one flexible canvas rather than a menu of fixed templates:

- `padTop` / `padBottom` — a solid band added above or below the photo, as a
  fraction of photo height. Zero for text straight over the image.
- `blocks` — any number of text runs, each with its own `x`/`y` centre (in
  fractions of the whole canvas), `width`, `size`, `font`, `color`, `stroke`,
  `align` and `rotation`.

That one mechanism covers Impact caps top and bottom, a white caption bar, a
single line across the bottom, a small handwritten label pinned to something in
the frame, a deadpan serif line — and combinations nobody wrote a template for.

Five typefaces are available: `impact` (Anton), `condensed` (Oswald), `sans`
(Inter), `serif` (Playfair Display) and `hand` (Caveat), each in light, regular
or bold. All self-hosted by `next/font`, so the canvas renders identically on
every machine.

Outline thickness scales with weight — a light face carrying an Impact-sized
outline reads as heavy, which would defeat the modern format.

**Nothing Claude returns can produce a broken image.** Numbers are clamped on
arrival, and the renderer independently keeps every block inside the canvas —
accounting for the outline width — so text cannot clip off an edge no matter
what the model returns or where you drag it.

## Layout

One centred column to start. Once there are results and the window is at least
1080px wide it splits: photo, controls and the selected variant's references on
the left, generations on the right. Narrower than that it stays a single feed,
and each variant's references collapse to thumbnails you tap to expand — all
three side by side at a size where the text is readable.

## Editing

Tap any text on the selected meme to select it, then drag it to move. The
controls underneath change the words, the size, the typeface, the colour, caps,
and the outline. Download re-renders at your photo's full resolution rather than
upscaling the preview.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server on `:3000` |
| `npm run build` | Production build (typechecks as part of it) |
| `npm start` | Serve the production build |
| `npm run typecheck` | Typecheck without building |
| `npm run upload -- <folder>` | Upload past memes to Vercel Blob |

## Deploying

Built for Vercel — import the repo, set two environment variables, add a domain.
Step-by-step instructions including DNS are in [`DEPLOY.md`](DEPLOY.md).
`ANTHROPIC_API_KEY` is read only inside `app/api/*`, so it never reaches a
browser.

Two things before this goes on a public URL: commit your `reference/` images so
the deploy has a style to work from, and set `APP_PASSWORD` so strangers cannot
spend your API credits.

It is a stock Next.js app, so `npm run build && npm start` also runs it on
Render, Railway, Fly.io or a VPS — which drops Vercel's function time limit and
lets you run `CLAUDE_EFFORT=high`.

## Access

Set `APP_PASSWORD` and the whole site is gated: every page and every API route.
Visitors get a login screen once, and a signed, HttpOnly, 30-day cookie keeps
them signed in — no re-entering it on each visit. Changing `APP_PASSWORD`
invalidates every outstanding session.

Leave it unset and the gate is off, which is what you want for local
development. There is also a per-IP hourly cap on generations
(`RATE_LIMIT_PER_HOUR`, default 30), best-effort on serverless.

## The logo

The header uses a CSS reconstruction of the wordmark by default, so the app
looks right out of the box. To use the real artwork, drop it in at
`public/logo.png` and set `NEXT_PUBLIC_LOGO=/logo.png`.

## Layout of the repo

```
app/
  page.tsx           the whole UI (client component)
  layout.tsx         the five self-hosted typefaces
  api/generate/      writes and designs the memes
  api/health/        config + reference count, used by the UI
  api/feedback/      records a like or dislike against a variant's references
lib/
  claude.ts          the prompt, the layout schema, the Claude call
  reference.ts       draws past memes from Blob (or the local folder)
  weights.ts         the like/dislike scores and how they bias the draw
  render.ts          canvas renderer, bounds clamping, hit-testing
  image.ts           file → full-res bitmap + downscaled copy for the API
  gate.ts            password check and per-IP rate limit
components/          Logo, Dropzone, MemeCanvas, BlockControls
scripts/
  upload-reference.ts  uploads a local folder of memes to Vercel Blob
  progress.ts          the terminal progress bar
reference/           local fallback for the style images
shared/types.ts      the meme spec, shared by both sides
```
