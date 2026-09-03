# Deploying to golfmemedigest.ericleonen.com

The app is one Node process: it serves the built React app *and* the API, so
there is nothing to split across two hosts. Your Anthropic key lives in that
process and never reaches a browser.

These steps use **Render**, because it runs a plain Node process, does custom
domains and TLS for free, and reads the `render.yaml` already in this repo.
Railway and Fly.io work the same way — see the bottom of this file.

---

## Step 1 — Get your Anthropic API key

1. Go to <https://console.anthropic.com> → **Settings → API keys** → *Create key*.
2. Copy it now; the console will not show it again.
3. Put a spend limit on it: **Settings → Limits**. Start at something you would
   not mind losing, like $20/month.

Sanity check locally before you deploy:

```bash
cp .env.example .env
# paste the key into ANTHROPIC_API_KEY=
npm install
npm run dev          # http://localhost:5173
```

Generate one meme. If that works locally, it will work deployed.

## Step 2 — Ingest the back catalogue, and commit it

This is the step that makes the output sound like your account instead of a
generic meme bot. Do it *before* deploying, because the deploy ships whatever
`data/corpus.json` contains at that commit.

```bash
# Put your past memes in corpus/images/, or use an Instagram export:
npm run ingest -- --instagram-export ~/Downloads/instagram-golfmemedigest

git add data/corpus.json
git commit -m "Ingest back catalogue"
```

Start with `--limit 25` if you want to see what it costs before committing to
the whole archive. The images themselves stay out of git; only the extracted
text catalogue is committed.

## Step 3 — Deploy to Render

1. <https://dashboard.render.com> → **New → Blueprint**.
2. Connect GitHub, pick `ericleonen/golfmemedigest-generator`, branch `main`.
3. Render reads `render.yaml` and prompts for the two secrets:
   - `ANTHROPIC_API_KEY` — the key from step 1.
   - `APP_PASSWORD` — pick any passphrase. **Set this.** Without it, anyone who
     finds the URL spends your API credits. You will type it into the app once
     and the browser remembers it.
4. **Create**. First build takes ~2 minutes.
5. Open the `onrender.com` URL Render gives you and generate a meme. Confirm it
   works there before touching DNS.

The `starter` plan in `render.yaml` is $7/month and always-on. The free plan
works too — change `plan: starter` to `plan: free` — but it sleeps after 15
minutes idle and the next request waits ~50 seconds for a cold start.

## Step 4 — Point your subdomain at it

**In Render:** your service → **Settings → Custom Domains → Add** →
`golfmemedigest.ericleonen.com`. Render shows you a target hostname like
`golfmemedigest-generator.onrender.com`.

**At your DNS provider** (wherever `ericleonen.com` is registered), add:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `golfmemedigest` | `golfmemedigest-generator.onrender.com` | auto / 300 |

Use the exact target Render displays. Enter the name as just `golfmemedigest`,
not the full domain — most providers append the rest.

If `ericleonen.com` is on **Cloudflare**, set that record to **DNS only** (grey
cloud) until Render reports the certificate as issued, then turn the orange
cloud back on if you want it proxied.

Render verifies the record and issues a Let's Encrypt certificate, usually
within a few minutes. Then:

```
https://golfmemedigest.ericleonen.com
```

## Step 5 — Check it

```bash
curl https://golfmemedigest.ericleonen.com/api/health
```

You want `"apiKeyConfigured": true`, `"authRequired": true`, and a non-zero
`corpus.total`. If `corpus.total` is 0, `data/corpus.json` was not committed —
go back to step 2.

---

## Keeping it running

**Updating the app.** Push to `main`; Render redeploys automatically.

**Adding new memes to the voice.** Re-run `npm run ingest` locally, commit
`data/corpus.json`, push. Ingest is incremental — it only pays for images it has
not read before.

**Watching the spend.** <https://console.anthropic.com> → Usage. The back
catalogue is sent on every generation but is served from Anthropic's prompt
cache at roughly a tenth of the price, provided requests come in within a few
minutes of each other. Bursts are much cheaper per meme than one request an
hour.

**Turning the cost down** if it is higher than you like, in order of impact:

1. `CLAUDE_EFFORT=medium` (or `low`) — the biggest lever, and honestly fine for
   meme writing. Set it in Render → Environment.
2. `CORPUS_MAX_CHARS=200000` — sends half as much catalogue per request.
3. `VARIANT_COUNT=2` — halves the output tokens.

**If someone finds the URL and hammers it:** the per-IP cap
(`RATE_LIMIT_PER_HOUR`, default 30) blunts it, and `APP_PASSWORD` stops it. If
you ever need to shut it off instantly, delete the `ANTHROPIC_API_KEY` env var
in Render — the app stays up and returns a clean error.

**Rotating the key:** create a new key in the Anthropic console, update it in
Render → Environment (which triggers a redeploy), then delete the old key.

---

## Other hosts

Same shape everywhere: build with `npm ci && npm run build`, start with
`npm start`, set `ANTHROPIC_API_KEY` and `APP_PASSWORD`, bind `$PORT` (already
handled), point a CNAME at whatever hostname they give you.

- **Railway** — `railway up`, then Settings → Networking → Custom Domain.
- **Fly.io** — `fly launch` (Node detected), `fly secrets set ANTHROPIC_API_KEY=... APP_PASSWORD=...`, `fly certs add golfmemedigest.ericleonen.com`.

**Vercel and Netlify need work first.** Both want serverless functions rather
than a long-running Node process, so `server/index.ts` would have to be split
into `/api` handlers. Doable, not free. Only worth it if you are already living
in that dashboard.
