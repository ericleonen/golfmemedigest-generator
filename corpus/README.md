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
| `--limit 25` | Only read the first 25 new images (good for a trial run) |
| `--concurrency 6` | Parallel requests, default 4 |
| `--dry-run` | Report what would be read, make no API calls |
| `--rebuild` | Re-read images already in the corpus |
| `--images <dir>` | Read from somewhere other than `corpus/images` |

Images over 5 MB are skipped — that is the Claude API's per-image limit. Resize
them first if you hit it.

See `corpus.example.json` for the shape of a finished corpus entry.
