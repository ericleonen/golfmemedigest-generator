# Back catalogue

This folder is where the account's own memes go. Nothing in here is committed —
`.gitignore` keeps the images and the generated corpus out of git.

## Option 1 — drop the images in

```
corpus/images/*.jpg|png|webp|gif
```

Sub-folders are fine, they get walked recursively.

Optionally add `corpus/captions.json` to attach the Instagram caption that was
posted with each image:

```json
{
  "2024-04-11-shank.jpg": "Every single Saturday.",
  "range-vs-course.png": "The range swing is a different man."
}
```

Then:

```bash
npm run ingest
```

## Engagement numbers (worth doing)

The app draws a small random sample of past memes for each run and weights that
draw by how each post performed. Give it the numbers in `corpus/engagement.json`:

```json
{
  "2024-04-11-shank.jpg": { "likes": 4200, "comments": 88, "views": 91000 },
  "range-vs-course.png": { "likes": 950, "comments": 12 }
}
```

Keys are file names as they appear under `corpus/images/` (a path relative to
that folder works too). Every field is optional — likes alone is enough, and
`views` is only used if you set `ENGAGEMENT_MODE=rate`.

**Instagram's data export does not include like counts**, so this file is how
you get them in. Two ways to fill it:

- **Meta Business Suite → Insights → Content**, filter to posts, export CSV,
  then map the columns you want into the JSON shape above.
- By hand for your top posts. You do not need all of them: anything missing is
  treated as a median-performing post, so a partial file still helps and never
  hides the rest of the catalogue.

Two payoffs: the draw tilts toward jokes that actually landed, and ingest reads
your best-performing images first — so `npm run ingest -- --limit 100` catalogues
your 100 strongest posts rather than the first 100 alphabetically.

## Option 2 — point it at an Instagram export

Instagram → Settings → Accounts Centre → Your information and permissions →
Download your information → **JSON** format, posts included. Unzip it, then:

```bash
npm run ingest -- --instagram-export ~/Downloads/instagram-golfmemedigest
```

The script reads `posts_*.json` for the caption on each post, and reads the
image files the export references.

## What ingest does

Each image goes to Claude once. It comes back with the text on the meme
(verbatim), the layout, a description of the photo, the comedic device and a few
topic tags. Everything lands in `data/corpus.json`, keyed by the SHA-1 of the
image file — so re-running only spends money on images it has not seen.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--limit 25` | Only read 25 new images — the 25 best, when engagement data exists |
| `--concurrency 6` | Parallel requests, default 4 |
| `--dry-run` | Report what would be read, make no API calls |
| `--rebuild` | Re-read images already in the corpus |
| `--images <dir>` | Read from somewhere other than `corpus/images` |
| `--engagement <file>` | Engagement JSON somewhere other than `corpus/engagement.json` |
| `--captions <file>` | Captions JSON somewhere other than `corpus/captions.json` |

Images over 5 MB are skipped — that is the Claude API's per-image limit. Resize
them first if you hit it.

See `corpus.example.json` for the shape of a finished corpus entry.
