# Golf Meme Digest generator

Drop in a photo, add a steer if you want one, and get back several finished
memes — Claude writes the joke *and* designs the layout. Pick one, nudge the
text, download it.

## How it works

1. **The browser** downsizes your photo to 1024px and posts it to `/api/generate`.
2. **The route handler** picks a few of your past memes at random from
   `reference/`, sends them to Claude as images alongside the new photo, and
   asks for N variants.
3. **Claude returns a layout**, not just words: where each run of text sits, how
   big, which typeface, what colour, whether the canvas gets a solid band above
   or below the photo.
4. **The browser draws it** on a canvas over your full-resolution photo. Drag any
   text to move it, change the words, nudge the size, then download.

There is no catalogue file and no ingest step. Put images in `reference/`,
commit them, done.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY into it
npm run dev
```

Open http://localhost:3000.

Then put 10-40 of your best past memes in [`reference/`](reference/README.md)
and commit them. Without them the app still works — it falls back to the voice
rules in `lib/claude.ts` — but it will not sound or look like your account.

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
(Inter), `serif` (Playfair Display) and `hand` (Caveat). All self-hosted by
`next/font`, so the canvas renders identically on every machine.

**Nothing Claude returns can produce a broken image.** Numbers are clamped on
arrival, and the renderer independently keeps every block inside the canvas —
accounting for the outline width — so text cannot clip off an edge no matter
what the model returns or where you drag it.

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
lib/
  claude.ts          the prompt, the layout schema, the Claude call
  reference.ts       picks past memes to send as style
  render.ts          canvas renderer, bounds clamping, hit-testing
  image.ts           file → full-res bitmap + downscaled copy for the API
  gate.ts            password check and per-IP rate limit
components/          Logo, Dropzone, MemeCanvas, BlockControls
reference/           your past memes — committed, sent to Claude as images
shared/types.ts      the meme spec, shared by both sides
```
