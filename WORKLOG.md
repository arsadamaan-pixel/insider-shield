# Worklog

## 2026-07-30 — Phase 1: Architecture Setup

- Confirmed Next.js 14+ project scaffold in place at repo root (from
  create-next-app).
- Authored `PLAN.md` with the Insider-Shield strategic roadmap, stack
  choices, and current milestone.
- Began Chrome Extension scaffolding under `extension/` (Manifest V3
  template, base background service worker, base content script, and
  options page).
- Completed Chrome Extension scaffolding: `extension/manifest.json`,
  `extension/background/background.js`, `extension/content/contentScript.js`,
  and `extension/options/options.html` are all in place as structural
  templates (no detection/data-collection logic yet).

**Status: Phase 1 scaffolding officially complete.**

## 2026-07-30 — Full Architecture Specification Adopted

- Received and saved the full Insider-Shield architecture specification
  (enterprise DLP / insider-threat platform: dashboard with users/assets/
  policies pages, geo-compliance map, WebSocket ingestion, Chrome
  Enterprise managed-policy endpoint agent) into `CLAUDE.md` as the
  master AI context document.
- Updated `PLAN.md` to sequence Phase 1 (complete) through Phase 5
  (hardening/compliance/deployment), with Phase 2 (dashboard + ingestion
  foundation) marked as the next active milestone.
- Extension scaffold (`extension/manifest.json`, `background/background.js`,
  `content/contentScript.js`, `options/options.html`) refreshed to match
  the spec's described responsibilities (managed-storage policy reader,
  WebSocket client stub, DLP listener stubs) — still placeholder-level,
  no real data capture or network transmission wired up yet.
- Noted: `src/app/` dashboard tree from the spec does not exist yet;
  project still uses the default `app/` directory. Migration is Phase 2.

**Status: Phase 1 complete; Phase 2 (dashboard & ingestion foundation) pending.**

## 2026-07-30 — Phase 2: Endpoint Agent Real-Time & Policy Logic

- Renumbered roadmap phases in `PLAN.md`: endpoint-agent work is now
  Phase 2, dashboard/ingestion foundation is now Phase 3, to match how
  the user refers to this work going forward.
- `extension/manifest.json`: permissions set to `["storage", "activeTab",
  "clipboardRead"]`. Dropped `"managedStorage"` (not a real Chrome
  permission string — `chrome.storage.managed` only needs `"storage"`)
  and deferred `"webNavigation"`/`"scripting"` (unused by any Phase 2
  code; will be added only when a concrete feature needs them, per
  least-privilege).
- `extension/background/background.js`: implemented `getEffectivePolicy()`
  (managed storage → local storage fallback → defaults, allow-listed and
  fail-closed so `transmitEvents`/`dlpEnabled` can never be accidentally
  turned on by a malformed policy), `getOrgKey()` (managed → local →
  generated `devOrgKey` for local dev), a WebSocket client with
  exponential backoff reconnect (1s–60s, jittered) that only connects
  when `transmitEvents` is true, a heartbeat loop sending timestamp +
  `chrome.runtime.getPlatformInfo()` + connection status, an OTA policy
  handler that validates and stores an allow-listed JSON config shape
  only (never executes remote code), and a bounded (50-item) in-memory
  buffer for DLP events queued while offline or while the kill switch is
  off.
- `extension/content/contentScript.js`: copy/cut listeners flag oversized
  selections; paste listener inspects `event.clipboardData` against a
  default pattern set (credit-card-like, SSN-like, API-key-like) plus a
  size threshold; added best-effort **active clipboard polling** via
  `navigator.clipboard.readText()` on a 15s interval while the tab has
  focus (per the user's confirmed choice for the more invasive clipboard
  option). All matches are debounced per rule and reported to the
  background worker as `{ hostname, ts, ruleName, excerptRedacted }` —
  the raw matched text is never sent, only a masked excerpt.
- Flag recorded for future reference: Chrome does not allow silent,
  unrestricted background clipboard reads from a content script — even
  with `clipboardRead` granted, `navigator.clipboard.readText()` normally
  requires document focus and a user gesture/transient activation.
  Reliable silent reads on enterprise-managed devices require the org's
  Chrome policy (e.g. `DefaultClipboardSetting` / `ClipboardAllowedForUrls`)
  to pre-authorize it; the extension permission alone does not bypass
  this. The polling loop fails gracefully (try/catch, logs once, backs
  off) rather than retrying in a tight loop when blocked.
- Kill switch confirmed end-to-end: `transmitEvents` defaults to `false`
  everywhere (no managed policy, no local policy, or a malformed one),
  so no DLP event or heartbeat leaves the device until an admin/dev
  explicitly enables it.
- Not yet built: the ingestion backend. `ws://localhost:3000/api/ws` has
  no listener, so the background worker's connection attempts are
  expected to fail and retry with backoff until Phase 3 stands up the
  server side. Also flagging for Phase 3 planning: standard Next.js API
  routes on Vercel don't support long-lived WebSocket upgrades, so the
  real backend will likely need a custom Node/`ws` process locally and a
  different transport (SSE, a managed realtime service) in production.

**Status: Phase 2 (endpoint agent) complete; Phase 3 (dashboard & ingestion foundation) pending.**

## 2026-07-30 — Phase 3: Dashboard & Ingestion Backend (in progress)

- Migrated the root `app/` directory to `src/app/` via `git mv` (Next.js
  ignores `src/app` if a root-level `app/` also exists, per the `next`
  docs bundled in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/src-folder.md`,
  so this was a full move, not an addition). Updated `tsconfig.json`'s
  `@/*` path alias from `./*` to `./src/*` to match.
- Installed `lucide-react` and `recharts` as new dependencies — both
  were listed in `CLAUDE.md`'s stack table but not yet installed
  (`leaflet`/`react-leaflet` deferred until the actual map is built in
  Phase 4).
- `src/types/`: added `employee.ts`, `dlpAlert.ts`, `systemPolicy.ts`
  (mirrors the extension's `DEFAULT_POLICY` shape so OTA updates
  round-trip without translation), `heartbeat.ts`, plus a barrel
  `index.ts`.
- `src/lib/mockData.ts`: seeded-PRNG (mulberry32) generators for
  employees, DLP alerts, and a dashboard snapshot aggregate — seeded so
  server-rendered output is stable per request instead of reshuffling.
- `src/lib/telemetryStore.ts` / `src/lib/policyStore.ts`: in-memory
  backing stores for the two API routes (resets on server restart — a
  real datastore is still open, tracked in `PLAN.md`).
- `src/app/api/telemetry/route.ts`: POST validates and records the two
  message shapes the extension already emits (`heartbeat`, `dlp_event`);
  GET returns the recent in-memory buffer for local inspection.
- `src/app/api/policies/route.ts`: GET returns current policy, POST
  validates against the same allow-listed field set the extension's
  `handleRemoteMessage` accepts (`dlpEnabled`, `transmitEvents`,
  `sensitivePatterns`, `heartbeatIntervalMs`, `wsEndpoint`) — unknown
  fields are dropped, not stored.
- `src/components/layout/Sidebar.tsx` + `Header.tsx`: dark SOC shell —
  sidebar nav (Overview / IAM Users / Policies / Asset Map) and a top
  header with a threat-status badge (derived from aggregate risk score)
  and a high-severity alert count badge.
- `src/app/page.tsx`: dashboard overview — metric cards (endpoint pings,
  high-severity alerts, geo violations), a Recharts `RadialBarChart` risk
  gauge, and a live incident feed table, all fed by the mock snapshot.
- `src/app/users/`, `src/app/assets/`, `src/app/policies/`: read-only
  placeholder pages so the sidebar nav doesn't 404 — full lifecycle
  actions, the real Leaflet map, and a policy-editing UI are Phase 4.
- Reworked `globals.css`/`layout.tsx` to a fixed dark theme (removed the
  old light/dark `prefers-color-scheme` toggle from the default
  create-next-app template, since this is a dedicated always-dark SOC
  console) and updated `metadata` title/description.
- Still open for Phase 3/4: no real datastore (in-memory only); no
  WebSocket server behind `wsEndpoint` (Vercel limitation noted
  previously still applies); no auth on the API routes yet (Phase 5).

**Status: Phase 3 (dashboard & ingestion foundation) in progress — UI and mock-backed API routes done; real-time transport and persistent storage remain.**

## 2026-07-30 — SQLite Data Persistence (Prisma) — COMPLETE

- Installed `prisma` and `@prisma/client` as devDependencies (as
  instructed) plus two required companions not explicitly requested but
  necessary for them to function: `dotenv` (Prisma 7's generated
  `prisma.config.ts` requires it to load `.env`) and `tsx` (to run the
  TypeScript seed script). Also required, discovered mid-task:
  `@prisma/adapter-better-sqlite3` — flagging below.
- **Breaking-change flag (per `AGENTS.md`'s warning that this isn't the
  Next.js/tooling you know — same applies here to Prisma):** the
  installed version is Prisma **7.9.1**, a major jump from the v5/v6
  generation. Two concrete differences that would have broken a
  "classic" Prisma setup:
  1. Config now lives in a required `prisma.config.ts` at the project
     root (generated via `npx prisma init`), not just `schema.prisma` +
     a `package.json` `"prisma"` key. The seed command is configured at
     `migrations.seed` in that file, not `package.json`.
  2. **`PrismaClient` no longer connects on its own** — it throws
     `PrismaClientInitializationError: ... A driver adapter is
     required to connect to your database` unless constructed with an
     explicit driver adapter. For SQLite that's
     `@prisma/adapter-better-sqlite3` (installed as a devDependency
     alongside the others), used in both `src/lib/prisma.ts` and
     `prisma/seed.ts`: `new PrismaClient({ adapter: new
     PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) })`.
  3. The client is generated to a custom path (`src/generated/prisma`,
     via `generator client { provider = "prisma-client" }`) rather than
     the old `node_modules/@prisma/client` default — imported here as
     `@/generated/prisma/client`. Added `postinstall: "prisma generate"`
     to `package.json` so a fresh `npm install` regenerates it (the
     folder is gitignored, like any generated code).
- `better-sqlite3`'s native binary needed its install script approved
  in this sandbox (`npm approve-scripts better-sqlite3 prisma
  @prisma/engines`) — without it the compiled `.node` binary is
  missing and the adapter can't load. Recorded in `package.json`'s new
  `allowScripts` block.
- `prisma/schema.prisma`: four models as specified —
  `Employee`, `DlpAlert`, `SystemPolicy`, `Heartbeat`. Two deliberate
  deviations from the literal field list, both to preserve behavior
  already built in Phase 3 rather than regress it:
  - Added `geoViolation` and `acknowledged` booleans to `DlpAlert` (they
    exist on the pre-existing `src/types/dlpAlert.ts` interface and
    drive the dashboard's geo-violation metric and incident table badges
    — dropping them would have silently broken both).
  - `DlpAlert.snippet` and `.redactedContent` are **both** always
    pre-redacted: `snippet` is a metadata-only description (e.g. `DLP
    rule "ssn_like" triggered on notion.so`) and `redactedContent` is
    the masked excerpt already produced upstream. Neither column is
    ever used to store raw matched sensitive text — consistent with the
    redaction practice established in Phase 2's content script.
  - `SystemPolicy` is a key/value table (`key`, `value` JSON-encoded,
    `updatedBy`, `updatedAt`) as specified, rather than one row per
    policy snapshot — `src/lib/policyStore.ts` assembles/decomposes it
    into the `SystemPolicy` TS shape so the rest of the app is unaware
    of the storage format.
- Ran `prisma migrate dev --name init` — created
  `prisma/migrations/20260730142128_init/` and the SQLite file at
  `./dev.db` (project root; gitignored, along with `*.db*` and
  `/src/generated/prisma`, in `.gitignore`).
- `prisma/seed.ts`: reuses `generateMockEmployees`/`generateMockDlpAlerts`
  from `src/lib/mockData.ts` (no new fake-data logic), clears all four
  tables and re-inserts, so it's safe to re-run. Fixed a latent bug this
  surfaced: `mockData.ts`'s employee email generation
  (`first.last@...`) could collide across 24 samples from a 140-name
  pool — added an index suffix to guarantee uniqueness, since
  `Employee.email` is now a real unique constraint.
- `src/app/api/telemetry/route.ts`: POST now `prisma.dlpAlert.create` /
  `prisma.heartbeat.create` instead of the removed
  `src/lib/telemetryStore.ts` (deleted — dead code once nothing imported
  it). GET queries the 50 most recent rows of each table.
- `src/app/api/policies/route.ts`: unchanged validation/allow-list logic,
  now backed by `getPolicy()`/`setPolicy()` in `src/lib/policyStore.ts`
  reading/writing the `SystemPolicy` table instead of a module-level
  variable. Added an optional `updatedBy` field on the POST body,
  defaulting to `"unknown"` since there's no auth yet (Phase 5).
- `src/app/page.tsx`: now queries `prisma.employee`/`dlpAlert`/`heartbeat`
  directly for the metric cards, risk gauge, and incident feed (mapping
  DB rows to the existing `DlpAlert` UI type via an email→name lookup
  built from the employees query). `src/app/policies/page.tsx` likewise
  now `await`s the now-async `getPolicy()`.
- **Bug caught during verification, not in the original instructions:**
  both pages were being statically prerendered at build time (`next
  build` showed `○ /` and `○ /policies`) — meaning Prisma would have
  queried the DB once at build time and frozen that snapshot into static
  HTML, so new telemetry would never appear without a rebuild. Added
  `export const dynamic = "force-dynamic"` to both files; a rebuild
  confirms they're now `ƒ` (server-rendered per request). `users/` and
  `assets/` are left on `mockData.ts` (deterministic, out of scope here)
  and are fine to stay static for now — see `PLAN.md` Phase 4 backlog.
- Verified end-to-end against the dev server: `POST /api/telemetry`
  with both a `dlp_event` and a `heartbeat` payload, confirmed both
  persisted via `GET /api/telemetry`; `POST /api/policies` round-tripped
  a `transmitEvents: true` update and it was reset back to `false`
  (the safe default) immediately after, so the kill switch wasn't left
  flipped on from testing. `npm run build` and `npm run lint` both pass.
- **Runtime-dependency caveat:** `@prisma/client` (and by extension
  `@prisma/adapter-better-sqlite3`) are installed as devDependencies per
  the instructions, but the generated client imports
  `@prisma/client/runtime/client` at request time, not just at codegen
  time — so they're genuinely needed in production, not just for
  building. Fine as-is for Vercel (its build tracing includes them
  regardless of `package.json` section), but flagging before any deploy
  target that does a `--omit=dev` install.
- Still open: no auth on any API route (Phase 5); `users`/`assets`
  pages not yet migrated off mock data; no real WebSocket transport
  behind `wsEndpoint` (unchanged from Phase 2/3 notes).

**Status: Phase 3 SQLite Data Persistence sub-task COMPLETE. Phase 3 overall remains in progress pending the real-time WebSocket transport.**

## 2026-07-30 — Git Milestone: Phase 1–3 Pushed to GitHub

- Reviewed `.gitignore`: confirmed `.env*`, `/node_modules`, `/.next/`,
  `*.db`, `*.db-journal`, `/prisma/dev.db`, and `/src/generated/prisma`
  are all covered (deduped one accidentally-repeated line). Verified via
  `git status --ignored` that `.env` and `dev.db` are in fact ignored,
  not just absent.
- Staged all Phase 1–3 work explicitly by path (docs, `extension/`,
  `prisma/`, `prisma.config.ts`, `src/`, config file changes) — checked
  `git diff --cached --name-only` against `.env`/`dev.db`/
  `generated/prisma` patterns first to confirm nothing sensitive or
  generated was picked up.
- Committed as `c534202`: `feat(phase3): implement SQLite database
  persistence, Prisma ORM, and dynamic page rendering` (40 files
  changed).
- This repo had no git remote configured yet. Asked before doing
  anything about it — user chose to create a new GitHub repo rather
  than push to an existing one. Created **`insider-shield`** as a
  **private** repo under the authenticated `arsadamaan-pixel` GitHub
  account via `gh repo create insider-shield --private --source=.
  --remote=origin`, then `git push -u origin main`.
- Remote: `git@github.com:arsadamaan-pixel/insider-shield.git`. `main`
  now tracks `origin/main`.

**Status: Phase 1–3 (through SQLite Data Persistence) pushed to `origin/main` on GitHub (`insider-shield`, private).**

## 2026-07-30 — Phase 3: Real-Time WebSocket Transport Engine

- `server.ts` (repo root, new): a custom Node server wrapping the
  Next.js App Router — `next({dev})`, `app.getRequestHandler()`,
  `createServer((req,res) => handle(req,res))` — exactly the recipe in
  `node_modules/next/dist/docs/01-app/02-guides/custom-server.md` (read
  in full first, per `AGENTS.md`'s instruction to check the bundled docs
  before writing custom-server code for this Next version). Attaches a
  `ws` `WebSocketServer({ noServer: true })` plus a manual
  `server.on('upgrade', ...)` listener scoped to `/api/ws` only; every
  other upgrade path (Turbopack's dev-mode HMR websocket in particular)
  is left untouched. Read `next/dist/server/next.js` to confirm this is
  safe: `getRequestHandler()`'s returned function self-attaches Next's
  *own* `'upgrade'` listener onto our `http.Server` the first time a
  request goes through `handle()` (`setupWebSocketHandler`, keyed off
  `req.socket.server`), so nothing needs to be manually forwarded to
  Next — our listener just has to no-op on non-`/api/ws` paths. Verified
  live: `[HMR] connected` still appears in the browser console with the
  custom server running.
- Connections are classified by a `?role=agent|dashboard` query param
  parsed at upgrade time; anything else gets a `400` and the socket is
  destroyed before `wss.handleUpgrade`. Two `Set<WebSocket>` registries
  (`agentSockets`, `dashboardSockets`); on close, removed from both
  (harmless no-op on whichever set it wasn't in).
- Dev runner: `tsx watch server.ts`, **not** `ts-node-dev` as originally
  requested — `tsx` was already a working devDependency here (runs
  `prisma/seed.ts` with this exact `esnext`/`bundler`/`@/*`-alias
  tsconfig), while `ts-node-dev` would have needed an added
  `tsconfig-paths` dependency to resolve the `@/*` alias and sees little
  ongoing maintenance. Confirmed with the user before deviating from the
  literal request.
- Shared validation/persistence logic factored out so the WS handlers
  and the pre-existing REST routes can't drift apart:
  - `src/lib/telemetryIngest.ts` (new): `RULE_SEVERITY`,
    `isValidDlpEvent`/`isValidHeartbeat` (moved out of
    `telemetry/route.ts`, now exported), plus new `ingestDlpEvent()`
    (persists via Prisma, resolves `employeeName` via
    `prisma.employee.findUnique`, returns the full `DlpAlert` shape) and
    `ingestHeartbeat()`. `telemetry/route.ts`'s POST now just validates
    and delegates; GET/external behavior unchanged.
  - `src/lib/policyStore.ts`: `ALLOWED_KEYS`/`isValidPatternList`
    (moved, private) plus a newly-exported `sanitizePolicyUpdate()`
    (was `policies/route.ts`'s local `sanitizeUpdate`, logic unchanged).
    `policies/route.ts`'s POST now just validates and delegates.
- `src/types/websocket.ts` (new, barrel-exported via `src/types/index.ts`):
  `WsRole`, `DlpAlertMessage`, `PolicyUpdateMessage` (server→client,
  always the *full* resulting `SystemPolicy`), `PolicyUpdateRequestMessage`
  (client→server, a *partial* update — kept as a distinct type from
  `PolicyUpdateMessage` since the two directions carry different
  shapes despite sharing a `"policy_update"` discriminant),
  `ServerToDashboardMessage`, `ServerToAgentMessage`,
  `DashboardToServerMessage`.
- Broadcast behavior: agent `dlp_event` → `ingestDlpEvent()` →
  `{type:"dlp_alert", alert}` to all dashboard sockets only (heartbeats
  are persisted but not broadcast — matches the literal "broadcast
  sanitized, real-time alert events" scope, not heartbeats). Dashboard
  `policy_update` → `sanitizePolicyUpdate()` → `setPolicy()` →
  `{type:"policy_update", policy}` (the full post-update policy) to
  **both** all agent sockets and all other dashboard sockets, so a
  second open dashboard tab stays in sync for free.
- `src/lib/useWebSocket.ts` (new): `useWebSocket({role, onMessage,
  enabled?})` client hook. URL derived from `window.location`
  (same-origin `/api/ws?role=dashboard`), deliberately not from
  `policy.wsEndpoint` — that field is the *agent's* configured endpoint,
  which may be a different origin in enterprise deployments. Reconnect
  backoff mirrors `extension/background/background.js`'s constants
  (1s base, 60s cap, ~30% jitter) for consistency across both transport
  clients. Latest `onMessage` kept in a ref so the connect/cleanup
  effect doesn't tear down and reconnect on every render from a fresh
  inline callback; a `closedByCleanupRef` guards against React Strict
  Mode's dev-mode double-invoke leaving an orphan reconnect timer from a
  discarded first mount. `send()` returns `false` (never throws) when
  the socket isn't open, so callers can fall back to REST.
- `src/components/dashboard/LiveIncidentFeed.tsx` (new, `"use client"`):
  wraps the existing `IncidentFeedTable` (unchanged), takes
  `initialAlerts` from the server-rendered snapshot, merges incoming
  `dlp_alert` messages (dedup by `id`, capped at 20 rows — same limit
  `page.tsx` already queries), shows a small live/reconnecting
  indicator. `src/app/page.tsx` swaps in this component in place of the
  old direct `<IncidentFeedTable>` call; metric cards and the risk gauge
  stay server-rendered snapshot values on this pass (not live-updated —
  kept the diff focused on the incident feed, which is what "live alert
  feeds" in the request was about).
- `src/components/policies/PolicyControlPanel.tsx` (new, `"use client"`):
  a minimal edit panel for `dlpEnabled`/`transmitEvents`/
  `heartbeatIntervalMs` (chosen as the three highest-value/highest-
  frequency fields; `sensitivePatterns`/`wsEndpoint` editing stays out
  of scope, left for the fuller Phase 4 Policies UI). Pushes
  `policy_update` over the dashboard-role socket on Save, with a
  `POST /api/policies` REST fallback when `send()` returns `false`
  (socket not open). Built now rather than deferred, per explicit user
  confirmation — `policies/page.tsx` had *no* edit UI at all before
  this, so "handle policy_update events emitted from dashboard clients"
  had nothing real to test against without it.
- `extension/background/background.js`: `connectWebSocket()` now builds
  the WS URL via `new URL(effectivePolicy.wsEndpoint)` +
  `searchParams.set("role", "agent")` instead of passing
  `wsEndpoint` straight through — previously **zero** query params were
  ever sent, so no real extension connection would have been classified
  by the new server at all. Scoped to this one change; the separate,
  pre-existing `getOrgKey()`/org-identity gap (heartbeat/dlp_event
  payloads never carry `orgKey` despite the type allowing one) is
  unchanged.
- `package.json`: added `ws` (runtime dependency) and `@types/ws`
  (devDependency); `"dev"` changed from `"next dev"` to
  `"tsx watch server.ts"`. `build`/`start` left untouched — production
  wiring is separate Phase 5 work (see `PLAN.md`).
- **Verified end-to-end**, not just type-checked: `npm run lint` and
  `npx tsc --noEmit` both clean. Local DB didn't exist yet in this fresh
  checkout (`node_modules` and `dev.db` are both gitignored) — created
  `.env` with `DATABASE_URL="file:./dev.db"`, ran
  `npx prisma migrate deploy` and `npm run db:seed` before the dashboard
  pages would render. With `npm run dev` running: a scratch `ws`-based
  Node client connected as `role=agent`, sent a `heartbeat` and a
  `dlp_event` — both persisted (`GET /api/telemetry` reflected them
  immediately). With a real browser open on `/` via Playwright, sending
  a further `dlp_event` from the scratch agent client made the new row
  appear in the Incident Feed **without a page reload**. A second
  scratch client connected as `role=dashboard`, sent a `policy_update`
  — persisted, and pushed live to a concurrently-connected `role=agent`
  scratch listener. In the real browser on `/policies`, toggled the new
  Policy Control Panel's checkboxes and clicked "Push Update" — UI
  confirmed "Pushed via WebSocket," `GET /api/policies` reflected the
  change. A connection with no `role` (or an invalid one) got rejected
  with HTTP 400 rather than silently accepted. Reset `dlpEnabled`/
  `transmitEvents` back to `false` afterward so the kill switch wasn't
  left flipped on from testing (same practice as the earlier
  SQLite-persistence testing entry above).
- Still open, carried forward: `build`/`start` don't run `server.ts` in
  production (Phase 5); Vercel specifically can't hold long-lived
  WebSocket upgrades, so production hosting needs its own decision
  later, not just reusing this server as-is; extension `getOrgKey()`/
  org-identity is still unwired (single implicit tenant only); Policy
  Control Panel intentionally covers only 3 of 5 `SystemPolicy` fields.

**Status: Phase 3 — Dashboard & Ingestion Foundation is now fully COMPLETE.** All of Phase 1–3 pushed and verified; Phase 4 (Detection, Geo-Compliance & Dashboard UX) is next.
