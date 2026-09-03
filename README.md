# @golfmemedigest meme generator

Drop in a photo, add a few words of steer if you want one, and get back several
meme variants written in the account's own voice. Pick a favourite, tweak the
wording, download the PNG.

## How it works

1. **The browser** downsizes your photo to 1024px and posts it to the local API.
2. **The API** builds a system prompt out of the account's back catalogue —
   every past meme it has ingested, with the text that was on it and a
   description of the photo — and asks Claude for N variants of on-image text.
3. **The browser** draws the winning text over your *full-resolution* photo on a
   canvas. The preview and the download come from the same renderer, so what you
   see is what you post.

The catalogue is what makes the output sound like the account rather than like a
generic meme bot, so it is worth ingesting properly — see
[`corpus/README.md`](corpus/README.md).

## Setup

```bash
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY into it
npm run dev               # web on :5173, api on :8787
```

Open http://localhost:5173.

Without a corpus the app still works — it writes from the voice rules in the
system prompt — but it will not sound like @golfmemedigest until you ingest the
back catalogue:

```bash
# put your past memes in corpus/images/, then:
npm run ingest
```

## The corpus, and the "entire catalogue" question

The whole back catalogue is sent as context on every request, which is the ideal
and is realistic given Claude's 1M-token context: a few thousand catalogued
memes is on the order of 100k tokens.

Past `CORPUS_MAX_CHARS` (default 400,000 characters, roughly 100k tokens) it
falls back to a random sample. That sample is **seeded on a timer** rather than
re-rolled per request: within `CORPUS_SAMPLE_TTL_MS` (default 4 minutes, just
under the prompt-cache TTL) every request sends a byte-identical prefix, so the
catalogue is served from Claude's prompt cache at a tenth of the price instead of
being re-billed in full on every generate. It rotates to a fresh sample after
that, so you still see the whole catalogue's influence over a session.

Either way, the response tells the UI which mode it used, and the badge in the
header shows it.

This is context, not fine-tuning. There is no training step and no model to
retrain when you post something new — re-run `npm run ingest` and the next
request picks it up.

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
| `npm run dev` | Vite dev server + API server together |
| `npm run build` | Typecheck and build the SPA into `dist/` |
| `npm start` | Serve the API *and* the built SPA from `:8787` |
| `npm run ingest` | Build/refresh `data/corpus.json` from the back catalogue |
| `npm run typecheck` | Typecheck everything without emitting |

## Deploying

`npm run build && npm start` serves the built SPA and the API from one Node
process, so any host that runs Node works. The only secret is
`ANTHROPIC_API_KEY`, and it never reaches the browser — the API key lives in the
server process and the browser only ever talks to `/api/*`.

## Configuration

Everything is optional except the API key. See [`.env.example`](.env.example);
the interesting ones are `CLAUDE_EFFORT` (drop to `medium` or `low` for faster,
cheaper generations) and `CORPUS_MAX_CHARS`.

## Layout of the repo

```
src/            React app
  lib/render.ts canvas meme renderer (previews and downloads)
  lib/image.ts  file → full-res bitmap + downscaled copy for the API
server/         Express API
  claude.ts     the prompt, the schema, the Claude call
  corpus.ts     catalogue loading, budgeting and cache-stable sampling
scripts/        ingest.ts — builds the catalogue from your past memes
shared/         types used by both sides
corpus/         where your past memes go (git-ignored)
```
