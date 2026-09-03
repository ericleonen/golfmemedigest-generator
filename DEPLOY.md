# Deploying to golfmemedigest.ericleonen.com

This is a Next.js app on Vercel. The React app and the two API routes ship as
one project; `ANTHROPIC_API_KEY` lives in Vercel's environment variables and is
only ever read inside `app/api/*`, so it never reaches a browser.

---

## Step 1 — Get your Anthropic API key

1. <https://console.anthropic.com> → **Settings → API keys** → *Create key*.
2. Copy it now; the console will not show it again.
3. Put a spend limit on it: **Settings → Limits**. Start at something you would
   not mind losing, like $20/month.

Check it locally before deploying:

```bash
cp .env.example .env.local     # Next reads .env.local; it is git-ignored
# paste the key into ANTHROPIC_API_KEY=
npm install
npm run dev                    # http://localhost:3000
```

Generate one meme. If that works, the deploy will work.

## Step 2 — Ingest the back catalogue, and commit it

This is what makes the output sound like your account instead of a generic meme
bot. Do it *before* deploying: `data/corpus.json` is bundled into the function
at build time, so the deploy ships whatever that file holds at that commit.

```bash
# Put your past memes in corpus/images/, or use an Instagram export:
npm run ingest -- --instagram-export ~/Downloads/instagram-golfmemedigest --limit 100

git add data/corpus.json
git commit -m "Ingest back catalogue"
git push
```

Add `corpus/engagement.json` with likes/comments per post first (see
[`corpus/README.md`](corpus/README.md)) — the app weights its random draw by
those numbers, and ingest then reads your best posts first, so `--limit 100`
catalogues your 100 strongest rather than the first 100 alphabetically.

Only the extracted text catalogue is committed; the images stay out of git.

## Step 3 — Deploy to Vercel

1. <https://vercel.com/new> → **Import Git Repository** →
   `ericleonen/golfmemedigest-generator`.
2. Vercel detects Next.js. Leave the build settings alone.
3. Expand **Environment Variables** and add two, for all environments
   (Production, Preview, Development):

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the key from step 1 |
   | `APP_PASSWORD` | any passphrase you choose |

   **Set `APP_PASSWORD`.** Without it, anyone who finds the URL spends your API
   credits. You type it into the app once and the browser remembers it.
4. **Deploy.** First build takes a couple of minutes.
5. Open the `*.vercel.app` URL and generate a meme before touching DNS.

Prefer the CLI? `npx vercel` to link and deploy a preview, `npx vercel --prod`
to promote, `npx vercel env add ANTHROPIC_API_KEY production` for the secrets.

## Step 4 — Point your subdomain at it

**In Vercel:** Project → **Settings → Domains → Add** →
`golfmemedigest.ericleonen.com`. Vercel shows you the exact record to create.

**At your DNS provider** (wherever `ericleonen.com` is registered):

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `golfmemedigest` | `cname.vercel-dns.com` | auto / 300 |

Use whatever target Vercel displays — it occasionally differs by region. Enter
the name as just `golfmemedigest`, not the full domain; most providers append
the rest.

If `ericleonen.com` is on **Cloudflare**, set the record to **DNS only** (grey
cloud). Vercel terminates TLS itself, and Cloudflare's proxy in front of it
causes redirect loops.

Vercel verifies the record and issues a certificate, usually within a few
minutes. Then: <https://golfmemedigest.ericleonen.com>

## Step 5 — Check it

```bash
curl https://golfmemedigest.ericleonen.com/api/health
```

You want `"apiKeyConfigured": true`, `"authRequired": true`, and a non-zero
`corpus.total`. If `corpus.total` is 0, `data/corpus.json` was not committed —
go back to step 2.

---

## The one thing to watch: function duration

Writing four meme variants takes tens of seconds, and a Vercel function has a
hard wall-clock limit — **60 seconds on Hobby**, higher on Pro. `maxDuration` is
set to 60 in `app/api/generate/route.ts`.

To stay inside that, `CLAUDE_EFFORT` defaults to `medium` rather than the API's
own `high`. For meme writing that is a fine trade. If you upgrade to Pro, you can
raise `maxDuration` in that file and set `CLAUDE_EFFORT=high` in Vercel's
environment variables for a quality bump.

If you ever see a 504, that is the timeout. Lower `CLAUDE_EFFORT` to `low`, or
generate 2 variants instead of 4.

## Keeping it running

**Updating the app.** Push to `main`; Vercel redeploys automatically. Pushes to
other branches get their own preview URL.

**Adding new memes to the voice.** Re-run `npm run ingest` locally, commit
`data/corpus.json`, push. Ingest is incremental — it only pays for images it has
not read before.

**Watching the spend.** <https://console.anthropic.com> → Usage. Only a handful
of past memes go out per request, so the input side is small; most of the cost
is the photo and the variants Claude writes back.

**Turning the cost down,** in order of impact — all of them are Vercel
environment variables, no code change:

1. `CLAUDE_EFFORT=low`
2. `VARIANT_COUNT=2` — halves the output tokens
3. `SAMPLE_SIZE=3` — a slightly smaller style sample

**Abuse.** `APP_PASSWORD` is the real lock. `RATE_LIMIT_PER_HOUR` (default 30
per IP) is a speed bump only: the counter lives in one function instance's
memory, so it does not survive cold starts or span instances. If you need a hard
cap, the spend limit on the API key is the backstop that actually holds. To kill
it instantly, delete `ANTHROPIC_API_KEY` in Vercel → Settings → Environment
Variables and redeploy; the site stays up and returns a clean error.

**Rotating the key.** Create a new key in the Anthropic console, update it in
Vercel, redeploy, then delete the old key.

---

## Running it somewhere other than Vercel

It is a stock Next.js app: `npm run build && npm start` serves everything from
one Node process on `$PORT`. Render, Railway, Fly.io and a plain VPS all work
with those two commands plus the same two environment variables. Self-hosting
also drops the function time limit, so you can run `CLAUDE_EFFORT=high`.
