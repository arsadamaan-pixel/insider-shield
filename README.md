# Insider-Shield

Enterprise insider-threat detection / DLP platform: a Chrome extension
endpoint agent + a Next.js SOC command center, connected over a
real-time WebSocket transport. See `CLAUDE.md` for the full
architecture spec and `PLAN.md`/`WORKLOG.md` for phase-by-phase status.

## Local development

```bash
npm install                      # also runs `prisma generate` (postinstall)
cp .env.example .env             # fill in ORG_ACCESS_KEY / BEARER_TOKEN / SESSION_SECRET
npm run db:migrate                # applies prisma/migrations/* to a local prisma/dev.db
npm run db:seed                   # populates it with synthetic employees/alerts
npm run dev                       # tsx watch server.ts — Next.js + the WS server at /api/ws
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`;
sign in with the `BEARER_TOKEN` value from your `.env`.

`npm run dev` runs `server.ts` (a custom Node server), **not** `next dev`
directly — that's what attaches the `ws` WebSocket server; stock
Next.js dev/start have no WebSocket upgrade support at all.

## Picking the project up on another machine

Everything needed is in git — but four things are deliberately **not**
committed and have to be recreated locally, which is what makes a fresh
clone look broken if you skip them:

| Not in git | Why | How to restore |
|---|---|---|
| `.env` | secrets | `cp .env.example .env`, then fill in values |
| `node_modules/` | platform-specific | `npm install` |
| `dev.db` | local data | `npm run db:migrate && npm run db:seed` |
| `src/generated/prisma/` | generated code | automatic — `npm install` runs `prisma generate` |

```bash
git clone git@github.com:arsadamaan-pixel/insider-shield.git
cd insider-shield

npm install
# This project uses npm's allowScripts gate. If install warns about
# packages with unapproved install scripts, approve the ones that need
# to compile native binaries — better-sqlite3 in particular will not
# work without it, and on an Apple Silicon Mac it must be rebuilt for
# arm64 rather than reusing anything from another machine:
#   npm approve-scripts better-sqlite3 prisma @prisma/engines esbuild sharp unrs-resolver

cp .env.example .env      # fill in ORG_ACCESS_KEY / BEARER_TOKEN / SESSION_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

For the test suite, install the browser once per machine:

```bash
npx playwright install chromium
npm run test:e2e          # expect 15/15 passing
```

To load the extension: `chrome://extensions` → Developer mode → **Load
unpacked** → select the `extension/` directory. Then open its Options
page and set the access key and server URL (see
[Agent setup](#agent-setup) below).

> `extension.crx` at the repo root is a stale packed build from an
> earlier phase — it predates the current icons, status badge, and
> keep-alive logic. Load the `extension/` directory unpacked instead;
> the `.crx` is not rebuilt by anything and should probably be deleted.

### Agent setup

One-time, per device:

1. Dashboard → **Agent Provisioning** → *Generate Agent Token* → copy it.
2. Extension Options page → paste it into **Org access key**, set
   **Server URL** to `wss://<your-deployment>/api/ws` (or
   `ws://localhost:3000/api/ws` for local), Save.
3. The agent connects immediately and appears under **Endpoints**.
4. DLP collection stays off until enabled from **Policies** — the
   connection is intentionally separate from the kill switch so the
   dashboard can turn devices on remotely.

## Tests

```bash
npm run test:e2e   # Playwright — see tests/env.ts for how this spins up
                    # its own disposable SQLite file/port/secrets, never
                    # touching your real dev.db or .env
```

## Production deployment (Render + Turso — $0/month)

This app needs two pieces of free infrastructure: a **Turso** database
(hosted SQLite, libsql-compatible) and a **Render** web service running
the Docker image in this repo. Neither requires a credit card on their
free tiers as of this writing — verify current limits on each provider
before relying on this for anything beyond a demo/portfolio deployment.

### 1. Create a Turso database

```bash
# https://docs.turso.tech/cli/installation
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup   # or `turso auth login` if you already have an account
turso db create insider-shield
turso db show insider-shield --url          # → libsql://insider-shield-<org>.turso.io
turso db tokens create insider-shield       # → a long JWT — this is TURSO_AUTH_TOKEN
```

### 2. Schema migrations — automatic on every deploy

**You shouldn't need to do this step manually anymore.** The Docker
image's `CMD` now runs `scripts/deploy-migrations.ts` every time the
container starts, before the app boots.

**Important correction, if you read an earlier version of this file:**
`prisma migrate deploy` does **not** work against a `libsql://` URL —
confirmed by reproducing it directly:
`DATABASE_URL="libsql://fake" npx prisma migrate deploy` fails
immediately with `P1013: The provided database string is invalid. The
scheme is not recognized`. Prisma's driver-adapter system
(`@prisma/adapter-libsql`) only covers the generated Client at runtime;
the separate Migrate/schema-engine tooling has no adapter hook at all.
So `scripts/deploy-migrations.ts` applies each migration's raw SQL
directly via `@libsql/client`'s `executeMultiple()` (documented by
libsql itself as intended for exactly this — "existing SQL scripts,
such as migrations") whenever `DATABASE_URL` is a `libsql://`/`http(s)`
URL, tracking what's already applied in its own small table
(`_deploy_migrations` — deliberately not Prisma's own
`_prisma_migrations`, since this path doesn't touch Prisma's migration
state at all). For a plain `file:` URL it still delegates to
`prisma migrate deploy`, which works fine there. Either way, only the
already-committed files in `prisma/migrations/` are ever applied —
nothing is diffed or dropped speculatively, unlike `prisma db push`, so
a normal deploy can't silently lose production data.

If you ever need to run it manually (first-time setup before the first
deploy, or to unblock a currently-broken deployment without waiting for
a redeploy):

```bash
DATABASE_URL="libsql://insider-shield-<org>.turso.io" \
TURSO_AUTH_TOKEN="<token from above>" \
npx tsx scripts/deploy-migrations.ts
```

If that ever fails for a specific database, fall back to applying each
migration's raw SQL directly via the Turso CLI, in order:

```bash
for f in prisma/migrations/*/migration.sql; do
  turso db shell insider-shield < "$f"
done
```

Either way, run `prisma/seed.ts` once against the same `DATABASE_URL`/
`TURSO_AUTH_TOKEN` if you want the dashboard to start with synthetic
demo data instead of empty tables:

```bash
DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npx tsx prisma/seed.ts
```

### 3. Deploy to Render

Either:

- **Blueprint (recommended):** push this repo to GitHub, then in Render
  click *New → Blueprint* and point it at the repo — `render.yaml` in
  this repo defines the service. You'll be prompted once for
  `DATABASE_URL` and `TURSO_AUTH_TOKEN`; `ORG_ACCESS_KEY`, `BEARER_TOKEN`,
  and `SESSION_SECRET` are auto-generated by Render on first deploy (see
  them under the service's Environment tab afterward).
- **Manual:** *New → Web Service* → connect the repo → Runtime: **Docker**
  → Plan: **Free** → set the environment variables below → Health Check
  Path: `/api/health`.

### 4. Environment variables

The 5 variables required for a Render.com deployment: `DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `ORG_ACCESS_KEY`, `BEARER_TOKEN`, `SESSION_SECRET`
(`NODE_ENV`/`PORT` below are set automatically by Render, not something
you configure).

| Variable            | Where it comes from                              | Required |
|----------------------|---------------------------------------------------|----------|
| `DATABASE_URL`        | Turso (`turso db show ... --url`) — or `file:./dev.db` locally | yes |
| `TURSO_AUTH_TOKEN`    | Turso (`turso db tokens create ...`) — only needed when `DATABASE_URL` is a `libsql://`/`https://` URL | only in production |
| `ORG_ACCESS_KEY`      | Any long random string — the Chrome extension's shared secret (WS query param / `X-Org-Access-Key` header) | yes |
| `BEARER_TOKEN`        | Any long random string — the SOC dashboard's login credential | yes |
| `SESSION_SECRET`      | Any long random string, **different from `BEARER_TOKEN`** — signs the session cookie | yes |
| `NODE_ENV`            | `production` on Render/Docker | yes in prod |
| `PORT`                | Set automatically by Render; defaults to `3000` locally/in Docker | no |

After deploying, update the Chrome extension's managed policy (or the
manual-entry fields on `extension/options/options.html`) with the
deployed `wss://<your-render-url>/api/ws` endpoint and the
`ORG_ACCESS_KEY` value from Render's dashboard.

### 5. Verify

```bash
curl https://<your-render-url>/api/health
# {"status":"ok","db":{"status":"ok","latencyMs":...},"ws":{"agentConnections":0,"dashboardConnections":0},"timestamp":"..."}
```

A non-200 response (or `"status":"error"`) most often means
`DATABASE_URL`/`TURSO_AUTH_TOKEN` are missing or the schema hasn't been
applied yet (step 2).

### Known limitations of this deployment path

- The `Dockerfile` was written and reviewed but **not build-tested**
  in the environment this repo was developed in (no Docker daemon
  available there) — verify `docker build` succeeds and the container
  boots cleanly on your machine/CI before treating this as
  production-ready. See its header comment and `WORKLOG.md` for exactly
  what to check.
- The Docker image itself is still unverified (see above). The
  migration step it now runs automatically at container start
  (`scripts/deploy-migrations.ts`) exists specifically because a prior
  version of this that called `prisma migrate deploy` directly against
  Turso caused the real production deploy to fail outright — see
  `WORKLOG.md`'s 2026-07-31 entries for the full story, including an
  earlier (incorrect) claim in this file that `migrate deploy` worked
  against Turso, which the actual failure disproved. If a future
  migration ever conflicts with existing production data, this script
  fails loudly and the container won't start rather than silently
  applying a destructive change — that's the intended behavior, not a
  bug to work around by switching to `db push`.
- Render's **free** web service plan spins down after periods of
  inactivity and cold-starts on the next request; the WebSocket
  connection (both dashboard tabs and any deployed extension agents)
  will drop and reconnect through their existing backoff logic when
  that happens. This is a free-tier trade-off, not a bug in this app.
  In production, `server.ts` self-pings its own `/api/health` every 10
  minutes to keep the instance awake and avoid this — which trades away
  the instance-hours savings the spin-down exists to provide, so check
  Render's current free-tier monthly hour limits against your expected
  traffic if you'd rather let it sleep instead.
- This deployment path is Render-specific because it needs a
  **custom Node server** (`server.ts`) for the WebSocket transport —
  Vercel's serverless/edge functions cannot hold a long-lived WS
  upgrade open at all (flagged since Phase 3 in `PLAN.md`), so "deploy
  to Vercel" instructions were deliberately not written here.
