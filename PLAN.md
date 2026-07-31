# Insider-Shield — Strategic Roadmap

See `CLAUDE.md` for the full architecture specification (stack, directory
structure, and status notes). This file tracks phase sequencing and
milestone status.

## Stack (summary)

| Layer               | Technology                                        |
|---------------------|----------------------------------------------------|
| Dashboard / backend  | Next.js 14+ (App Router), React 18, Tailwind CSS   |
| Dashboard UI         | Lucide React, Recharts, Leaflet / React-Leaflet    |
| Endpoint agent        | Chrome Extension, Manifest V3, `chrome.storage.managed` |
| Real-time transport   | WebSockets                                         |
| Ingestion API         | Next.js API Routes                                 |
| Hosting               | Vercel                                              |

## Phases

### Phase 1 — Architecture Setup — ✅ COMPLETE
- [x] Scaffold Next.js app (via create-next-app).
- [x] Author `CLAUDE.md` with the full Insider-Shield architecture spec.
- [x] Author `PLAN.md` and `WORKLOG.md`.
- [x] Scaffold `extension/` base structure: `manifest.json`,
      `background/background.js`, `content/contentScript.js`,
      `options/options.html`.
- Scope: structural placeholders only — no real detection, DLP, or
  transport logic implemented yet.

### Phase 2 — Endpoint Agent: Real-Time & Managed Policy — ✅ COMPLETE
- [x] Implement `chrome.storage.managed` policy reader (with local-dev
      fallback) in `background/background.js`, merged into an
      allow-listed, fail-closed effective policy.
- [x] Implement WebSocket client in the background worker: connect only
      when `policy.transmitEvents` is true, exponential backoff
      reconnect, heartbeat with platform info.
- [x] OTA remote-policy channel: background worker validates and stores
      allow-listed JSON config only — no remote code execution.
- [x] Define DLP event schema (`{ type, hostname, ts, ruleName,
      excerptRedacted }`) shared between content script and background.
- [x] Wire `content/contentScript.js` DLP listeners (copy/cut/paste +
      best-effort active clipboard polling, redacted excerpts only) to
      emit that schema via `chrome.runtime.sendMessage`.
- Flags carried forward: `ws://localhost:3000/api/ws` has no server yet
  (Phase 3); active clipboard reads are best-effort per real Chrome
  platform constraints (focus/gesture, or enterprise clipboard policy on
  managed devices) — see `WORKLOG.md` for detail.

### Phase 3 — Dashboard & Ingestion Foundation — 🔄 IN PROGRESS
- [x] Migrate `app/` to the `src/app/` layout described in `CLAUDE.md`
      (`tsconfig.json` `@/*` path updated to `./src/*`).
- [x] Build root layout with sidebar/header (`src/app/layout.tsx`,
      `src/components/layout/Sidebar.tsx`, `Header.tsx`).
- [x] Build SOC Dashboard Overview (`src/app/page.tsx`): metric cards,
      risk score gauge (Recharts `RadialBarChart`), live incident feed
      table.
- [x] Scaffold `users/`, `assets/`, `policies/` route pages — read-only
      placeholders backed by mock data; full lifecycle/editing UI is
      Phase 4.
- [x] Define TypeScript types (`src/types/`): `Employee`, `DlpAlert`,
      `SystemPolicy`, `HeartbeatPayload`.
- [x] Build mock data generator (`src/lib/mockData.ts`) — deterministic
      (seeded PRNG) synthetic employees, DLP alerts, and geo locations.
- [x] Stand up ingestion API routes: `src/app/api/telemetry/route.ts`
      (POST heartbeat/dlp_event payloads matching the extension's
      message shapes, GET to inspect the in-memory buffer) and
      `src/app/api/policies/route.ts` (GET/POST OTA policy, allow-listed
      fields only, mirrors `extension/background/background.js`'s
      `handleRemoteMessage` validation).
- [x] **SQLite Data Persistence — COMPLETE.** Prisma ORM + SQLite via
      the `@prisma/adapter-better-sqlite3` driver adapter (Prisma 7
      requires an explicit driver adapter — see `WORKLOG.md`). Models:
      `Employee`, `DlpAlert`, `SystemPolicy` (key/value), `Heartbeat` in
      `prisma/schema.prisma`. Seed script (`prisma/seed.ts`, run via
      `npm run db:seed`) populates from the existing `mockData.ts`
      generators. `telemetry/route.ts` and `policies/route.ts` now
      read/write SQLite directly (in-memory stores removed); the
      dashboard (`src/app/page.tsx`) and policies page now query the DB
      and are marked `export const dynamic = "force-dynamic"` so they
      reflect live writes instead of a build-time snapshot.
- Added `lucide-react` and `recharts` as dependencies (per the stack
  table above) to build the sidebar icons and risk gauge.
- Added `prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3`,
  `tsx`, `dotenv` — see `WORKLOG.md` for a caveat on `@prisma/client`
  being a devDependency despite being required at runtime.
- [x] **Real-Time WebSocket Transport Engine — COMPLETE.** `server.ts`
      (repo root) wraps the Next.js App Router in a custom Node `http`
      server and attaches a `ws` WebSocket server at `/api/ws`, routing
      connections by a `role=agent|dashboard` handshake query param.
      Agent-role sockets: heartbeat/dlp_event payloads validated and
      persisted via Prisma (`src/lib/telemetryIngest.ts`, shared with
      the REST fallback), DLP alerts broadcast live to all
      dashboard-role sockets. Dashboard-role sockets: `policy_update`
      payloads validated (`sanitizePolicyUpdate` in
      `src/lib/policyStore.ts`, shared with the REST route), persisted,
      and pushed live to all agent-role **and** dashboard-role sockets
      (multi-tab consistency). `src/lib/useWebSocket.ts` (client hook,
      same-origin URL, extension-matching reconnect backoff) powers a
      live Incident Feed on the Overview page
      (`src/components/dashboard/LiveIncidentFeed.tsx`) and a new
      Policy Control Panel on the Policies page
      (`src/components/policies/PolicyControlPanel.tsx`, REST fallback
      when the socket isn't open) — the Policies page previously had no
      edit UI at all. `extension/background/background.js` updated to
      send `?role=agent` on connect (it previously sent no query params
      at all, which would have left every real agent connection
      unclassified). `npm run dev` now runs `tsx watch server.ts`
      instead of `next dev`. `build`/`start` intentionally left on stock
      Next.js for now — see "Note carried forward" below.
- Note carried forward: `build`/`start` still don't run the custom WS
  server (scoped to local dev for this task); production hosting is
  Phase 5 work, and Vercel specifically can't hold long-lived WebSocket
  upgrades at all, so that will need its own decision (a different host,
  or SSE/a managed realtime service) rather than just reusing
  `server.ts` as-is. The extension's `getOrgKey()`/org-identity gap
  (heartbeat/dlp_event payloads never include `orgKey`) is unchanged —
  every agent socket is currently treated as the same implicit
  single-tenant org, consistent with the rest of the app having no
  auth yet.

### Phase 4 — Detection, Geo-Compliance & Dashboard UX — 🔄 IN PROGRESS
- [x] **IAM Users page — COMPLETE.** `src/app/users/page.tsx` migrated
      off `mockData.ts` onto real `prisma.employee.findMany()` data.
      New `src/components/users/EmployeeTable.tsx` (status/risk badges,
      last-seen column) and `src/components/users/OffboardModal.tsx`
      (the first modal/dialog in this codebase) implement a "1-Click
      Offboard / Revoke Key" action: `POST
      /api/employees/[id]/revoke` sets `status: "offboarded"` +
      `offboardedAt`, then force-terminates that employee's live
      WebSocket session(s) via `src/lib/wsRegistry.ts`'s
      `terminateEmployeeSessions()`.
- [x] **Employee identity plumbing — added to make the above real, not
      cosmetic.** The extension previously sent zero identity with its
      WebSocket connection (see the Phase 3 "org-identity gap" note,
      now partially closed). `extension/background/background.js` gained
      `getEmployeeEmail()` (managed-storage-first, no anonymous
      fallback — unlike `getOrgKey()`) plus a manual-entry field on the
      previously-blank `extension/options/options.html`/new
      `options.js`. Heartbeats/DLP events now carry `employeeEmail`;
      `server.ts`'s WS upgrade handler reads it, looks up the employee,
      and **rejects (403) reconnects for any non-active employee** —
      without this, a revoked employee's extension would just
      reconnect within its normal backoff. `src/lib/telemetryIngest.ts`'s
      `ingestHeartbeat()` now denormalizes `lastSeenAt`/`lastKnownIp`
      onto the `Employee` row on every real heartbeat.
- [x] **Geo-Compliance Asset Map — COMPLETE.** `src/app/assets/page.tsx`
      migrated off `mockData.ts`. New `src/lib/geo.ts` formalizes the
      old ad-hoc mock-city logic into a reusable `geoForEmployee()`
      helper (deterministic per-employee position — not a live IP→geo
      lookup, see `WORKLOG.md` for why). `leaflet`/`react-leaflet`
      integrated via `src/components/assets/LeafletMap.tsx`
      (`"use client"`) behind `src/components/assets/AssetMap.tsx`'s
      `next/dynamic(...,{ssr:false})` wrapper (required — Leaflet
      touches `window`/`document` at import time). Markers are
      `CircleMarker`s colored green/red by compliance, computed from
      real data (`DlpAlert.geoViolation` + `acknowledged`), not a
      synthetic flag. Side panel
      (`src/components/assets/AssetDetailPanel.tsx`) shows OS/IP/last
      heartbeat/compliance per endpoint.
- [ ] Rule-based anomaly detection on ingested events.
- [ ] Fuller Policies UI for remote OTA rule authoring/distribution —
      `sensitivePatterns` and `wsEndpoint` editing, plus an audit trail.
      The minimal Policy Control Panel added in Phase 3 covers
      `dlpEnabled`/`transmitEvents`/`heartbeatIntervalMs` only.
- [ ] Charts/analytics on the dashboard overview (Recharts).
- Schema migration `employee_identity_and_lifecycle_fields`: added
  `Employee.title`/`managedDeviceId` (unique)/`lastSeenAt`/`lastKnownIp`/
  `offboardedAt`, and `Heartbeat.employeeEmail`/`ipAddress`. Added
  `leaflet`, `react-leaflet`, `@types/leaflet` as dependencies.
- Note carried forward: the extension org-identity gap is only
  *partially* closed — `employeeEmail` is now wired end-to-end, but
  `getOrgKey()` (true org/tenant identity, vs. one specific employee)
  remains dead code, and there's still no real authentication on who
  can call the revoke endpoint or set an extension's `employeeEmail` —
  both are Phase 5 territory. The revoke flow's durable enforcement is
  the WS-upgrade-time 403 gate; the `terminate_session` message the
  extension receives is a courtesy notice only, and deliberately does
  **not** set a local "stop reconnecting" flag (it'll keep retrying on
  its normal backoff against the 403, same as any other sustained
  rejection) — see `WORKLOG.md` for the reasoning.

### Phase 5 — Hardening, Compliance & Deployment — 🔄 IN PROGRESS
- [x] **Authentication/authorization for the dashboard and API —
      COMPLETE.** Two shared secrets: `ORG_ACCESS_KEY` (Chrome-extension
      agents — WS query param, `X-Org-Access-Key` REST header) and
      `BEARER_TOKEN` (the SOC dashboard's single login credential, at
      `/login`). Login issues an HMAC-signed httpOnly session cookie
      (`src/lib/auth.ts`, built-in `crypto`, no new dependency — a full
      JWT library would buy nothing for one shared secret with no
      per-user claims). `src/proxy.ts` gates every dashboard page and
      API route behind that session (Next 16 renamed `middleware.ts` to
      `proxy.ts` — confirmed against the bundled docs, no `middleware.md`
      exists in this Next version's doc tree at all), with `/login`,
      `/api/auth/login`, and `/api/telemetry` excluded (the last one is
      agent traffic, self-gated by `ORG_ACCESS_KEY` instead — a blanket
      session check there would reject legitimate agent requests).
      `/api/ws`'s WS upgrade handler (`server.ts`) can't be reached by
      `proxy.ts` at all (WS upgrades fire Node's `upgrade` event, never
      the `request` event proxy hooks into) so it has its own equivalent
      checks. Every Route Handler also self-guards (defense-in-depth,
      not relying on proxy alone, per Next's own docs' explicit
      recommendation). `ORG_ACCESS_KEY` is a new, separate concept from
      the extension's pre-existing `orgKey` (a random per-install device
      ID, still unrelated dead code). Split into `src/lib/auth.ts`
      (pure validators/session logic, zero `next/server` imports) and
      `src/lib/authGuards.ts` (the `NextResponse`-returning Route
      Handler wrappers) — importing `next/server` at the top of a module
      `server.ts` loads before `next({...})` runs crashes with an
      `AsyncLocalStorage` error, caught and fixed during verification.
- [x] **Audit logging — COMPLETE.** New `AuditLog` model
      (`src/lib/auditLog.ts`'s `logAuditEvent()`), wired into: policy
      updates (both the WS and REST paths), employee offboard/revoke,
      DLP event ingestion (not heartbeats — high-volume liveness pings,
      low audit value), and auth failures at every gate (agent/dashboard
      WS rejections, failed logins) — the last one wasn't explicitly
      asked for but is a standard high-value audit use case directly
      complementary to the endpoint-security work above. Login also
      captures an optional operator label (carried in the signed
      session), used as `actorEmail` on that operator's subsequent
      actions — without it, every dashboard action would log under the
      same generic string, defeating the point of an audit trail. New
      `/audit` page: live (WS-pushed), searchable, filterable
      (`src/components/audit/LiveAuditTrail.tsx`) — the first
      search/filter UI in this codebase, no existing pattern to reuse.
- [ ] Legal/compliance review of DLP data collection (notice, consent,
      data retention, jurisdiction) before enabling real capture.
- [ ] Vercel deployment pipeline and environment configuration.
- Restructured `src/app/` into a `(dashboard)` route group (`page.tsx`,
  `users/`, `policies/`, `assets/`, `audit/`) with its own layout
  rendering `<Sidebar/>`, so `/login` (outside the group) renders
  without a sidebar full of pre-login dead links — the standard Next.js
  pattern for "some routes need a different layout." The root
  `layout.tsx` now only provides `<html>/<body>` + fonts.
- New env vars (`.env`, `.env.example` added for onboarding):
  `ORG_ACCESS_KEY`, `BEARER_TOKEN`, `SESSION_SECRET` (deliberately a
  different value from `BEARER_TOKEN` — the login credential and the
  cookie-signing key shouldn't be the same secret).

### Phase 6 — Automated E2E Testing & Hardening — ✅ COMPLETE
- [x] `playwright.config.ts`: drives the *real* `server.ts` (not
      `next build && next start`, which per the Phase 3 note has no WS
      transport at all) via `webServer: { command: "npx tsx server.ts" }`
      against a dedicated port (3100), a dedicated SQLite file
      (`prisma/e2e-test.db`), and dedicated `ORG_ACCESS_KEY`/
      `BEARER_TOKEN`/`SESSION_SECRET` values (`tests/env.ts`) — never
      the developer's real `dev.db`/`.env`/port-3000 dev server.
- [x] DB initialization/reset: `tests/global-setup.ts` deletes any
      stale `e2e-test.db*` files, runs `prisma migrate deploy` against
      it, then seeds exactly one `Employee` row
      (`tests/seed-e2e-employee.ts`) — deliberately *not*
      `prisma/seed.ts`'s full mock dataset, so assertions never depend
      on (or flake against) unrelated random seed data.
      `tests/global-teardown.ts` wipes the same files after the run.
- [x] `tests/e2e.spec.ts` — five scenarios, run `serial` against one
      shared authenticated page and one shared agent WebSocket (later
      steps genuinely depend on earlier ones — see file header):
      1. **Auth & Session Flow** — logs in with the test `BEARER_TOKEN`,
         confirms redirect + dashboard content + an `httpOnly` `is_session`
         cookie.
      2. **Telemetry & WS Broadcast** — a raw `ws` client (playing the
         agent) sends a `credit_card_like` (severity `high`) `dlp_event`;
         asserts the row appears in the Overview page's Live Incident
         Feed with **zero** `page.goto()`/reload in the test.
      3. **Policy Push** — flips a checkbox in the Policy Control Panel,
         clicks Push Update, asserts both the UI's "Pushed via WebSocket"
         confirmation *and* that the same agent socket actually receives
         the resulting `policy_update` message.
      4. **IAM Offboarding & Revocation** — offboards the test employee
         via `/users`, asserts the live agent socket gets a
         `terminate_session` notice and then closes with code `4001`
         (`wsRegistry.ts`'s actual close code), then opens a *new*
         connection for the same employee and asserts it's rejected at
         the WS-upgrade level with HTTP **403** (via `ws`'s
         `unexpected-response` event) — not just delayed.
      5. **Audit Trail Verification** — navigates to `/audit`, asserts
         `login_succeeded`, `policy_update`, and `employee_revoked` rows
         all show the correct actor email and a real `hh:mm:ss`
         timestamp.
- [x] All 5 scenarios pass, twice in a row (confirming the fresh-DB
      reset makes each run deterministic, not order-dependent on
      leftover state). `npm run build` and `npm run lint` both still
      pass with the new `tests/`/`playwright.config.ts` files in the
      tsconfig's `**/*.ts` glob.
- Added `test:e2e": "playwright test"` script. `@playwright/test` was
  already in `package.json` (from the earlier `chore(phase6)` commit)
  but had never actually been `npm install`ed — see `WORKLOG.md`.
- Fixed during verification, not anticipated up front: Prisma 7's
  generated client (`src/generated/prisma/client.ts`) is an ES module
  with a top-level `import.meta.url` — dynamically `import()`-ing it
  directly inside `global-setup.ts` throws `Cannot require() ES Module
  ... in a cycle` under Playwright's own config/setup loader. Fixed by
  running the one-employee seed as its own `tsx` child process
  (`tests/seed-e2e-employee.ts`), the same pattern `prisma/seed.ts`
  already used successfully — see `WORKLOG.md`.

### Phase 7 — Production Readiness & Deployment Configuration — ✅ CONFIGURATION READY
Named "configuration ready" rather than "complete": everything below was
written, code-reviewed, and passes `npm run build`/`lint`/`test:e2e`,
but the two genuinely external pieces (a real Docker build, and Prisma
Migrate against a real Turso database) could not be exercised in the
environment this was built in — no Docker daemon was available, and no
Turso account/credentials exist here. See the flags below and
`WORKLOG.md`/`README.md` for exactly what that means and what to verify
before a first real deploy.

- [x] **Docker & production build.** Multi-stage `Dockerfile`: `builder`
      stage (Debian-based `node:22-bookworm-slim` + a C toolchain for
      better-sqlite3/sharp's native bindings) runs the full `npm ci` +
      `next build`; `runner` stage copies the already-built
      `node_modules`/`.next`/source into a clean base image and runs
      `server.ts` via `tsx` directly (exec form, for correct `SIGTERM`
      handling) — not `next start`, which per the Phase 3 note still has
      no WebSocket transport at all. `node_modules` is copied unpruned
      (devDependencies included) rather than a `--omit=dev` install,
      because `tsx` compiles `server.ts`'s TypeScript on the fly at
      runtime and `prisma.config.ts` (needed for any one-off `prisma
      migrate deploy` run against production) needs `dotenv` — both
      real runtime/ops dependencies despite conventionally living in
      `devDependencies`. Includes a Docker `HEALTHCHECK` hitting
      `/api/health` via Node's built-in `fetch` (no `curl` needed in the
      image). `render.yaml` blueprint (schema verified against Render's
      current docs, not assumed from training data — `runtime: docker`,
      not the older/discouraged `env: docker`) defines a free-plan
      Docker web service with `healthCheckPath: /api/health`,
      `generateValue: true` for the three app secrets, `sync: false` for
      `DATABASE_URL`/`TURSO_AUTH_TOKEN`.
- [x] **Database flexibility (Turso/libsql).** `src/lib/prisma.ts` now
      branches on `DATABASE_URL`'s scheme: a plain `file:` URL still
      uses `@prisma/adapter-better-sqlite3` (local dev/CI, unchanged
      behavior — all of Phase 6's e2e tests still pass against this
      path); a `libsql://`/`http(s)://` URL uses the new
      `@prisma/adapter-libsql` adapter with `TURSO_AUTH_TOKEN`, throwing
      a clear error at startup if the token is missing rather than
      failing obscurely later. No `prisma/schema.prisma` changes needed
      — both adapters implement the same `provider = "sqlite"` Prisma
      datasource; only the driver differs.
- [x] **Health & readiness endpoint.** `src/app/api/health/route.ts`
      (new — didn't exist before this phase): runs `SELECT 1` through
      the live Prisma connection (catches and reports real DB failures,
      not a hardcoded 200), and reports live WebSocket connection counts
      read directly from `src/lib/wsRegistry.ts`'s registry (the same
      in-process state `terminateEmployeeSessions()` uses) — genuine
      status, not a placeholder. Returns 200 when the DB check passes,
      503 otherwise, matching what container healthchecks expect.
      Excluded from `src/proxy.ts`'s dashboard-session gate (a
      healthcheck can't present a session cookie); reveals only
      aggregate counts, never employee/alert data, so leaving it
      unauthenticated is safe.
- [x] **Dependency-placement fix.** `@prisma/client`,
      `@prisma/adapter-better-sqlite3`, and `tsx` moved from
      `devDependencies` to `dependencies` — all three are imported
      directly by runtime code (`src/lib/prisma.ts`, `server.ts`) and
      would break under any `--omit=dev`-style production install. This
      was flagged (but deliberately left as-is, per explicit instruction
      at the time) back in the SQLite Data Persistence work — Phase 7 is
      the point where it would have actually mattered, so fixed now.
- [x] **Docs.** `README.md` rewritten from the default create-next-app
      template: local dev setup, `npm run test:e2e`, and a full Render +
      Turso deployment walkthrough (Turso CLI setup, schema application
      — with the honest caveat below — Render blueprint vs. manual
      setup, the env var reference table, and a "known limitations"
      section). `.env.example` updated with `TURSO_AUTH_TOKEN`.
- **Flag — Turso migration path unverified.** `prisma migrate deploy`
  may not work directly against a `libsql://` URL — Prisma's migration
  engine has historically had uneven libsql/Hrana protocol support, and
  this genuinely could not be checked without a real Turso account.
  README.md documents a fallback (piping each
  `prisma/migrations/*/migration.sql` through `turso db shell`
  directly) and says explicitly to try the direct path first rather
  than assuming either way.
- **Flag — Dockerfile unverified.** Written and reasoned through
  carefully (see its own header comment) but never actually run through
  `docker build`/`docker run` — no Docker daemon was available in this
  environment. Verify locally or in CI before a real deploy.
- Free-tier trade-off, not a bug: Render's free web service plan spins
  down on inactivity; a cold start drops any open WebSocket connections
  (dashboard tabs, deployed extension agents), which reconnect through
  their existing backoff logic once the container is back up.
- [x] **Keep-alive self-ping — added 2026-07-31.** `server.ts` pings its
      own `/api/health` every 10 minutes (production only —
      `NODE_ENV !== "production"` skips it entirely, so local dev/test
      never pings the real deployed URL) to keep the Render free-tier
      instance from spinning down. This trades away the instance-hours
      savings the spin-down behavior exists to provide — self-pinging
      keeps it awake roughly 24/7 — so it's a deliberate choice to
      prioritize uptime over free-tier hour budget; see `WORKLOG.md`.
- [x] **Automatic production schema sync — added 2026-07-31, fixing a
      real production 500 on `/provisioning`, then fixed again the same
      day after the first version's own Docker deploy failed.**
      `Dockerfile`'s `CMD` runs `scripts/deploy-migrations.ts` on every
      container start before the app boots — the only point Render's
      real runtime env vars (`DATABASE_URL`/`TURSO_AUTH_TOKEN`) are
      present. Root cause of the *original* bug: a migration added in
      Phase 8 was never re-applied to the production Turso database
      after the one-time manual setup in Phase 7.
      Deliberately **not** `prisma db push --accept-data-loss` (which
      was what was actually requested) — `db push` diffs and pushes
      schema changes destructively when needed, and running that
      automatically on every deploy risks silently dropping production
      data (including the audit trail) the first time a future
      migration is structurally destructive.
      **Correction:** the first fix called `prisma migrate deploy`
      directly, which was itself wrong — Prisma's Migrate/schema-engine
      does not support `libsql://` URLs at all (`P1013: The provided
      database string is invalid. The scheme is not recognized`,
      reproduced locally), only the generated Client's driver-adapter
      system does. `scripts/deploy-migrations.ts` instead applies each
      migration's SQL **statement by statement** via `@libsql/client`
      for a `libsql`/`http(s)` `DATABASE_URL` (falling back to
      `prisma migrate deploy` for a plain `file:` URL, which does
      work), treating "already exists" as already-satisfied rather
      than fatal — needed because production's `Employee` etc. tables
      already existed from the original manual `turso db shell`
      bootstrap, predating this tracking. **Second correction, same
      day:** the first version of this script called
      `executeMultiple()` per *file* and its statement filter
      accidentally rejected every real statement (every one starts
      with a `-- CreateTable`-style comment line) — meaning it would
      have silently run zero SQL while marking every migration
      "applied." Caught before pushing this time, with a permanent
      regression test (`tests/deploy-migrations.spec.ts`) reproducing
      the exact "some tables pre-exist" production scenario via
      `@libsql/client`'s local `file:` mode. Either path only applies
      already-committed migration files in order and fails loudly on a
      genuine conflict — never a speculative destructive change. See
      `WORKLOG.md` for the full reasoning, all fix attempts, and the
      Render `preDeployCommand` alternative considered (and not used,
      due to
      unclear Docker-runtime support in Render's own docs).

### Phase 8 — Enterprise Provisioning & One-Click Agent Token Generation — ✅ COMPLETE
- [x] **Backend.** New `ProvisioningToken` Prisma model — only a
      SHA-256 hash of the raw token is ever stored (same pattern as
      GitHub/Stripe API keys); the raw value is returned exactly once,
      in the creation response, and never retrievable again.
      `src/lib/agentTokens.ts`: `createProvisioningToken()`,
      `listProvisioningTokens()`, `revokeProvisioningToken()`, and
      `verifyAgentCredential()` — the last one checks the static
      `ORG_ACCESS_KEY` first (cheap, no DB hit, preserves all prior
      behavior) before falling back to a per-device token lookup, so
      existing agents/tests keep working unchanged.
      `POST /api/admin/provision-token` (dashboard-session only —
      never `ORG_ACCESS_KEY`; an agent must never mint its own
      credentials), `GET /api/admin/provision-token` (list, hash never
      exposed), `POST /api/admin/provision-token/revoke`. All three
      audit-logged (`provisioning_token_created`/`_revoked`, added to
      `AUDIT_ACTIONS`).
- [x] **Real integration, not a decorative UI.** `server.ts`'s WS
      upgrade handler and `src/lib/authGuards.ts`'s
      `requireOrgAccessKey()` (used by the REST `/api/telemetry` POST)
      both now call `verifyAgentCredential()` instead of the old
      static-only check — a provisioned token is a genuinely valid
      agent credential over the *same* `orgAccessKey` query param /
      header the extension already sends, zero extension-side changes
      needed. `src/lib/wsRegistry.ts` gained
      `agentSocketsByTokenId`/`terminateTokenSessions()`, mirroring the
      existing per-employee termination — revoking a token immediately
      force-closes any live session authenticated with it (courtesy
      `terminate_session` notice, then WS close code `4001`, same as
      employee offboarding) *and* blocks all future reconnect attempts
      with that token (401 at the WS-upgrade level). Manually verified
      end-to-end against a running dev server before writing the
      automated test: generate → connect → revoke → live session
      terminated → reconnect rejected.
- [x] **Frontend.** New "Agent Provisioning" sidebar entry →
      `/provisioning`. `TokenGeneratorCard` (employee picker, optional
      device name, expiration select, "Generate Agent Token") shows the
      raw token masked-by-default with reveal/copy, plus a QR code
      (`qrcode` package) encoding the token + a short manual
      "quick guide" — no auto-scan provisioning flow exists in the
      extension, so this is a copy/reference aid, not a functioning
      scan-to-configure pipeline, and the component's own comments say
      so rather than implying more than it does. `TokenTable` ("Active
      Provisioning Keys": device/employee, token ID prefix, status,
      issued, last-used, one-click Revoke). `ProvisioningWorkspace`
      ties the two together client-side (mirrors the existing
      EmployeeTable/OffboardModal state-lifting pattern) so a newly
      generated or revoked token updates the table immediately, no
      reload.
- [x] **Tests.** `tests/provisioning.spec.ts` (new, independent of
      `tests/e2e.spec.ts` — deliberately doesn't depend on that suite's
      one seeded employee, which it offboards in its own last test):
      auth-boundary checks (GET/POST require a dashboard session), a
      full UI flow (generate → reveal/copy → table row → revoke →
      status flips), and two integration tests hitting the API/WS
      directly (a provisioned token opens a real agent WS connection;
      revoking it force-closes that session with code `4001` and
      rejects a reconnect with 401; double-revoke and unknown-id are
      both handled cleanly). 10/10 tests pass across the whole suite
      (5 from Phase 6 + 5 new), twice in a row.
- Added `qrcode`/`@types/qrcode` dependencies.
- Added `permissions: ["clipboard-read", "clipboard-write"]` to
  `playwright.config.ts` — Chromium refuses `navigator.clipboard
  .writeText()` headlessly without it, caught by the new Copy-button
  test.

## Active Milestone

**Phase 8 — Enterprise Provisioning & One-Click Agent Token Generation**
is complete as of 2026-07-31. Phase 7 remains "configuration-ready"
(Docker build and Turso migration path still unverified pending a real
Docker daemon/Turso account). Phase 5's legal/compliance review is the
only other item still open across all eight phases.
