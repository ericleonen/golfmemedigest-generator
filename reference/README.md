# Local style reference (fallback)

This folder is only used when `BLOB_READ_WRITE_TOKEN` is not set — a fresh
clone with no Vercel Blob store still runs. **In production the style reference
comes from Vercel Blob**, uploaded with:

```bash
npm run upload -- ~/Pictures/golfmemedigest
```

See the README for that workflow. Everything below applies to both.

Each **variant** is its own Claude call and gets its own **three** past memes,
sent as images alongside the new photo. The draw happens once per run and is
dealt out, so four variants see twelve *different* posts — no meme turns up
behind two variants.

They are not shown as a style guide; the format is chosen separately in the app.
They are there so Claude can work out *why each one is funny* — the mechanism,
not the topic — and build the new meme on that same mechanism.

Because every variant sees different material, four variants are four
independent attempts rather than four rewrites of one idea. The app shows the
three it learned from under each result, so when one lands you can see what
primed it.

Practical notes:

- **Keep them small.** Resize to roughly 1080px on the long edge. Each image
  costs vision tokens on every generation, and the API rejects anything over
  5 MB. Oversized files are skipped with a warning rather than failing the run.
- **Files dropped in here go in git.** That is fine for a handful as a local
  fallback; a thousand belongs in Blob, which is what the upload script is for.
- **Pick your best.** Three posts set the reasoning for each variant, so a
  folder of your strongest work beats a folder of everything.
- **Keep at least 3 x your variant count.** Four variants needs twelve to give
  everyone a distinct set; below that, references start repeating across
  variants (never within one).
- **Variety matters more than volume.** Include the different treatments you
  actually use — Impact over photo, caption bar, one-liners — or Claude will
  only ever reproduce the one style it keeps seeing.

Check `/api/health` after deploying: `referenceImages` should match what you
uploaded. Zero means the deployment cannot see the Blob store.
