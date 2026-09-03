# @golfmemedigest meme generator

Drop in a photo, add a few words of steer if you want one, and get back several
meme variants written in the account's own voice. Pick a favourite, tweak the
wording, download the PNG.

## How it works

1. **The browser** downsizes your photo to 1024px and posts it to `/api/generate`.
2. **The route handler** draws a handful of past memes from the catalogue —
   randomly, weighted toward the ones that performed best — puts them in the
   system prompt as the house voice, and asks Claude for N variants of on-image
   text.
3. **The browser** draws the winning text over your *full-resolution* photo on a
   canvas. The preview and the download come from the same renderer, so what you
   see is what you post.

The catalogue is what makes the output sound like the account rather than like a
generic meme bot, so it is worth ingesting properly — see
[`corpus/README.md`](corpus/README.md).

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY into it
npm run dev
```

Open http://localhost:3000.

Without a corpus the app still works — it writes from the voice rules in the
system prompt — but it will not sound like @golfmemedigest until you ingest the
back catalogue:

```bash
# put your past memes in corpus/images/, then:
npm run ingest
```

## How the style sample works

Each run draws a small random sample of past memes (3-5, your pick in the UI)
rather than sending the whole catalogue. That is deliberate on two counts: a
varied sample produces genuinely different jokes run to run, where a fixed block
of everything pulls every request toward the same average — and a handful of
posts costs a fraction of the tokens.

The draw is weighted by how each post performed, so the voice tracks what
actually landed:

- **Score.** `likes + COMMENT_WEIGHT × comments` (comments default to 5× a like;
  they cost the reader more, so they separate "this landed" from "this scrolled
  past pleasantly"). Set `ENGAGEMENT_MODE=rate` to divide by views instead,
  which scores the joke rather than how far the algorithm pushed the post.
- **Weight.** Each score as a ratio of the catalogue median, raised to
  `ENGAGEMENT_POWER`. The default is **0.5**, not 1, because engagement is
  heavy-tailed: at 1, one viral post turns up in almost every draw and the
  variety you wanted disappears. Set it to `0` for a flat random draw, or `2` to
  let the hits dominate.
- **Posts with no numbers** are scored at the catalogue median, so a
  half-annotated catalogue still draws from all of it. With no engagement data
  at all, the draw is uniformly random.
- **Nothing is ever fully excluded** — a post that flopped keeps 5% of the
  median's odds.

Engagement numbers come from `corpus/engagement.json`; see
[`corpus/README.md`](corpus/README.md). Instagram's own data export does not
include like counts, so that file is how you get them in.

Because the draw is small and popularity-weighted, you do not need to catalogue
your whole archive — ingesting your best few hundred posts is a reasonable
place to stop, and `npm run ingest -- --limit 100` reads the highest-engagement
images first when it has the numbers to sort by.

This is context, not fine-tuning. There is no training step and no model to
retrain when you post something new — re-run `npm run ingest`, commit, deploy.

## Layouts

| Layout | What it looks like |
| --- | --- |
| `top-bottom` | Classic Impact caps at the top and bottom of the photo |
| `caption-bar` | A white bar above an untouched photo, tweet-style |
| `lower-third` | One Impact line across the bottom, over a soft dark scrim |

Claude picks a layout per variant, and you can override it in the editor panel.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server on `:3000` |
| `npm run build` | Production build (typechecks as part of it) |
| `npm start` | Serve the production build |
| `npm run ingest` | Build/refresh `data/corpus.json` from the back catalogue |
| `npm run typecheck` | Typecheck without building |

## Deploying

Built for Vercel — import the repo, set two environment variables, add a domain.
Step-by-step instructions including DNS are in [`DEPLOY.md`](DEPLOY.md).
`ANTHROPIC_API_KEY` is read only inside `app/api/*`, so it never reaches a
browser.

Two things matter before this goes on a public URL: commit `data/corpus.json` so
the deploy ships with the account's voice, and set `APP_PASSWORD` so strangers
cannot spend your API credits.

It is a stock Next.js app, so `npm run build && npm start` also runs it on
Render, Railway, Fly.io or a VPS — which drops Vercel's function time limit and
lets you run `CLAUDE_EFFORT=high`.

## Configuration

Everything is optional except the API key. See [`.env.example`](.env.example);
the interesting ones are `CLAUDE_EFFORT` (drop to `low` for faster, cheaper
generations) and the `ENGAGEMENT_*` knobs above.

## Layout of the repo

```
app/
  page.tsx           the whole UI (client component)
  layout.tsx         self-hosted Anton + Inter via next/font
  api/generate/      the meme-writing endpoint
  api/health/        config + catalogue status, used by the UI badge
lib/
  render.ts          canvas meme renderer (previews and downloads)
  image.ts           file → full-res bitmap + downscaled copy for the API
  claude.ts          the prompt, the schema, the Claude call (server only)
  corpus.ts          the weighted random draw over the catalogue
  gate.ts            password check and per-IP rate limit
components/          Dropzone, MemePreview, VariantEditor
scripts/ingest.ts    builds the catalogue from your past memes
shared/types.ts      types used by both sides
data/corpus.json     the catalogue — committed, bundled into the function
corpus/              where your past meme images go (git-ignored)
```
