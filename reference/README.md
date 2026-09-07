# Local style reference (fallback)

This folder is only used when `BLOB_READ_WRITE_TOKEN` is not set — a fresh
clone with no Vercel Blob store still runs. **In production the style reference
comes from Vercel Blob**, uploaded with:

```bash
npm run upload -- ~/Pictures/golfmemedigest
```

See the README for that workflow. Everything below applies to both.

Each **variant** is its own Claude call and draws its own `REFERENCE_SAMPLE_SIZE`
of them at random (3 by default), sent as images alongside the new photo. Claude
reads them for voice, joke construction, and visual habits: where text sits, how
big it is, which typeface, whether there is a band.

Because every variant sees a different handful, four variants are four
independent attempts rather than four rewrites of one idea. The app shows the
thumbnails it drew under each result, so when one variant lands you can see what
primed it.

Practical notes:

- **Keep them small.** Resize to roughly 1080px on the long edge. Each image
  costs vision tokens on every generation, and the API rejects anything over
  5 MB. Oversized files are skipped with a warning rather than failing the run.
- **Files dropped in here go in git.** That is fine for a handful as a local
  fallback; a thousand belongs in Blob, which is what the upload script is for.
- **Pick your best.** Three random posts set the tone for each variant, so a
  folder of your strongest work beats a folder of everything.
- **Variety matters more than volume.** Include the different treatments you
  actually use — Impact over photo, caption bar, one-liners — or Claude will
  only ever reproduce the one style it keeps seeing.

Check `/api/health` after deploying: `referenceImages` should match what you
uploaded. Zero means the deployment cannot see the Blob store.
