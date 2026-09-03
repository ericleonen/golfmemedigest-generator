# Style reference

Put 10-40 of your own past memes in this folder and commit them. JPEG, PNG or
WebP. That is the entire setup — there is no catalogue file and no ingest step.

On each run the app picks `REFERENCE_SAMPLE_SIZE` of them at random (4 by
default) and sends them to Claude as images, alongside the new photo. Claude
reads them for voice, joke construction, and visual habits: where text sits, how
big it is, which typeface, whether there is a band.

Practical notes:

- **Keep them small.** Resize to roughly 1080px on the long edge. Each image
  costs vision tokens on every generation, and the API rejects anything over
  5 MB. Oversized files are skipped with a warning rather than failing the run.
- **They go in git**, so they end up in the deployed function bundle. A few
  dozen at ~200 KB each is nothing; a few hundred full-resolution photos would
  be a problem.
- **Pick your best.** Four random posts set the tone for everything generated,
  so a folder of your strongest work beats a folder of everything.
- **Variety matters more than volume.** Include the different treatments you
  actually use — Impact over photo, caption bar, one-liners — or Claude will
  only ever reproduce the one style it keeps seeing.

Check `/api/health` after deploying: `referenceImages` should match what you
committed. Zero means the folder did not make it into the bundle.
