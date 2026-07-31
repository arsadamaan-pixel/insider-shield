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

## 2026-07-30 — Phase 4: IAM Users & Geo-Compliance Asset Map

- **Investigation before building anything**: the extension sent zero
  identity with its WebSocket connection/telemetry (no `employeeEmail`
  anywhere), so "force-terminate that specific user's session" wasn't
  achievable as literally targeted. Confirmed with the user (rather than
  silently picking): add real per-employee identity wiring (chosen) vs.
  a DB-status-only + broadcast-to-everyone fallback. Also confirmed the
  Asset Map's geo data source: a deterministic per-employee helper
  (chosen) vs. a real IP→GeoIP lookup, which would need a new dependency
  and show nothing useful for localhost/private IPs in local dev.
- **Schema migration** `employee_identity_and_lifecycle_fields`
  (`prisma migrate dev` doesn't support this sandbox's non-interactive
  environment — generated the SQL via `prisma migrate diff
  --from-migrations ... --to-schema ...`, wrote it into a manually-named
  migration folder, applied with `prisma migrate deploy`, same as the
  workaround used for the initial Phase 3 migration). Added to
  `Employee`: `title`, `managedDeviceId` (now `@unique` — prevents two
  employees ever claiming the same device), `lastSeenAt`, `lastKnownIp`,
  `offboardedAt`. Added to `Heartbeat`: `employeeEmail`, `ipAddress`,
  plus an index on `employeeEmail`.
- `src/lib/geo.ts` (new) and `src/lib/risk.ts` (new): the mock-city
  array, mulberry32 PRNG, and `riskLevelFromScore` were moved out of
  `src/lib/mockData.ts` verbatim (confirmed via `grep` that the mock
  `Employee` type — renamed `MockEmployee` — is used nowhere else, so
  this was a pure, behavior-identical refactor; `policies/page.tsx`'s
  unrelated use of `generateDashboardSnapshot()` for Header stats is
  unaffected). `geo.ts` adds `geoForEmployee({id})`: a *new* function
  seeding its own PRNG from a hash of the employee id, independent of
  `mockData.ts`'s shared-sequence generator — deterministic per
  employee, used by the real Prisma-backed Assets page.
- `src/lib/wsRegistry.ts` (new): the `agentSockets`/`dashboardSockets`
  registry and `broadcast()` helper were extracted out of `server.ts`
  (which now only handles bootstrapping + protocol logic) so a plain
  Next.js Route Handler — the new revoke endpoint — can import
  `terminateEmployeeSessions(email)` directly without importing from the
  process entrypoint. `globalThis`-cached (same pattern as
  `src/lib/prisma.ts`) as a guard against `server.ts`'s `tsx` loader and
  Next's own dev-mode bundler instantiating the module twice, which
  would otherwise make the revoke route silently operate on an empty
  registry that never saw a real connection — verified empirically (see
  below) that this isn't happening, not just trusted blind.
- **`server.ts`**: the WS upgrade handler now reads an optional
  `employeeEmail` query param (agent connections only) and the real
  connecting IP from `req.socket.remoteAddress`. **When present, looks
  up the employee and rejects the upgrade (403) unless `status ===
  "active"`** — without this, `terminateEmployeeSessions()` only delays
  reconnection by one backoff cycle instead of actually blocking it, and
  the whole revoke feature would be cosmetic. `handleAgentMessage` now
  threads connection-level identity into `ingestHeartbeat`/
  `ingestDlpEvent`, with the connection's authenticated identity always
  winning over anything a payload itself claims.
- `src/lib/telemetryIngest.ts`: `IncomingHeartbeat` gained an optional
  `employeeEmail` (parallel to the existing `orgKey`). `ingestHeartbeat`
  now also does a `prisma.employee.updateMany` (not `update` — an
  unrecognized/mistyped email, plausible given the options-page field is
  free text, must silently match zero rows, not throw) to denormalize
  `lastSeenAt`/`lastKnownIp` onto the `Employee` row on every real
  heartbeat. `IncomingDlpEvent`/`ingestDlpEvent` already had
  `employeeEmail` fully wired from Phase 3 — only the extension needed
  to start actually sending it.
- `src/types/websocket.ts`: added `TerminateSessionMessage
  {type:"terminate_session", reason?}`; `ServerToAgentMessage` is now a
  2-member union.
- `extension/background/background.js`: new `getEmployeeEmail()`
  (managed → local, **no anonymous fallback** — unlike `getOrgKey()`'s
  `dev-<uuid>` pattern, since a fake identity would defeat the point).
  `connectWebSocket()` appends `?employeeEmail=` when set; heartbeat and
  `dlp_event` payload builders both include it. New `handleRemoteMessage`
  branch for `terminate_session`: logs and closes the socket —
  deliberately does **not** set a local "stop reconnecting" flag. The
  durable block is the server's upgrade-time 403 gate, not client
  cooperation; `scheduleReconnect()` will keep retrying on its normal
  backoff against the rejection (same as it would against any other
  sustained rejection) — a known, accepted limitation, not silently
  "fixed" by adding scope that wasn't asked for. Also: an `employeeEmail`
  change now closes and re-establishes the current connection (was
  previously only done for `policy` changes), since a stale connection
  would otherwise sit under the wrong identity until it happened to
  drop.
- `extension/options/options.html` (previously a bare scaffold with *no
  script tag at all*) + new `extension/options/options.js`: minimal
  email input + Save button writing/clearing
  `chrome.storage.local.employeeEmail`. New separate `.js` file because
  MV3 CSP forbids inline `<script>` blocks. Bumped
  `extension/manifest.json` version to `0.4.0` and updated its
  description to mention Phase 4.
- New `src/app/api/employees/[id]/revoke/route.ts`: `POST` only (Next
  16's dynamic `params` is a `Promise`, confirmed against the bundled
  docs and `await`ed). Updates `status`/`offboardedAt` **before** calling
  `terminateEmployeeSessions` (closes the race where an instant reconnect
  could otherwise slip through while status is still `"active"`).
  Re-revoking an already-offboarded employee succeeds idempotently
  (200, `terminatedSessions` naturally `0`) rather than erroring. Plain
  REST is sufficient here — unlike `PolicyControlPanel`, this is a
  one-shot admin action and `wsRegistry.ts`'s state is directly
  reachable from any Route Handler in the same process, no need to route
  it through a dashboard's own WebSocket connection.
- **Users page**: `src/app/users/page.tsx` migrated off `mockData.ts`
  onto `prisma.employee.findMany()`; `riskLevel` computed on read via
  `riskLevelFromScore` (never persisted). New `src/types/employee.ts`
  `EnrichedEmployee` type for the real shape (old mock-only `Employee`
  interface renamed `MockEmployee`). New
  `src/components/users/EmployeeTable.tsx` (`"use client"`, reuses the
  existing status/risk badge styling, adds a Last Seen column, disables
  the action button once already offboarded, does a local optimistic
  update after a successful revoke instead of refetching) and
  `src/components/users/OffboardModal.tsx` — **the first modal/dialog in
  this codebase** (confirmed via `grep` — no prior pattern to follow, no
  headless-ui/radix dependency; plain Tailwind fixed-overlay `div`,
  `role="dialog"`, Escape-to-close, backdrop-click-to-close, a confirm
  step before the destructive call since "1-click to open the action
  modal" isn't the same ask as "no confirmation at all").
- **Assets page**: `src/app/assets/page.tsx` migrated off `mockData.ts`.
  New `src/types/asset.ts` `AssetEndpoint` composite type. Compliance
  (green/red) computed from real data — any unacknowledged
  `DlpAlert.geoViolation:true` for that employee — not a synthetic flag.
  "OS" comes from each employee's most recent `Heartbeat.platform`
  (fetched once, reduced to first-per-email in JS — flagged for a proper
  `groupBy`/cap if the table grows, fine at current scale). Split into
  three components because Leaflet touches `window`/`document` at import
  time and Next's App Router disallows `dynamic(...,{ssr:false})` called
  directly from a Server Component:
  `src/components/assets/LeafletMap.tsx` (`"use client"`, the actual
  `MapContainer`/`TileLayer`/`CircleMarker` markup),
  `src/components/assets/AssetMap.tsx` (`"use client"`, the
  `dynamic(...,{ssr:false})` wrapper + shared selected-asset state),
  `src/components/assets/AssetDetailPanel.tsx` (presentational, no
  `"use client"` needed since it's only ever rendered from the
  already-client `AssetMap.tsx`). Markers are `CircleMarker`s colored by
  compliance rather than the default Leaflet pin icon — sidesteps the
  well-known Next.js/webpack default-marker-icon-404 problem entirely.
  Tile source: public OpenStreetMap (free, no key) — fine for local dev,
  flagged as a production/Phase-5 concern.
- Added `leaflet@^1.9.4`, `react-leaflet@^5.0.0` (v5 targets React 19 —
  v4 targets React 18 and would have been wrong for this repo, confirmed
  via `npm view` peer deps before installing), `@types/leaflet` (dev).
- `prisma/seed.ts`: now populates the new `Employee` columns (`title`,
  `managedDeviceId`, `lastSeenAt`) that were previously generated by
  `mockData.ts` but silently dropped during seeding. Seeded heartbeats
  now carry `employeeEmail`/varied `platform.os`/an `ipAddress`; the
  employee insert denormalizes `lastKnownIp` to match what a real
  `ingestHeartbeat()` call would have set (seeding bypasses that
  function, calling `prisma.heartbeat.createMany` directly, so this
  needed doing explicitly). Added one explicit guaranteed
  geo-violation/unacknowledged alert for the first device-bound employee
  so the Asset Map always has at least one visible red marker regardless
  of what the deterministic mock sequence happens to produce.
- **Verified end-to-end**, not just type-checked: `npm run lint` and
  `npx tsc --noEmit` clean throughout. Re-seeded and started `npm run
  dev`. Confirmed via a real Playwright browser session: `/users` renders
  live Prisma data (not mock); the Asset Map renders 24 real
  `CircleMarker`s including 2 red (violation) ones, clicking one opens
  the detail panel with correct employee/device/OS/IP/compliance data.
  With a scratch `ws`-based agent script connected as a real active
  employee's `employeeEmail`: confirmed normal connection succeeds,
  then — while a second scratch listener stayed connected as that same
  employee — called `POST /api/employees/[id]/revoke` via `curl` and
  confirmed the live listener received `{type:"terminate_session",
  reason:"offboarded"}` and was closed (code `4001`), the API response
  showed `status:"offboarded"` and `terminatedSessions:1`, and a
  subsequent reconnect attempt as that same (now offboarded) email was
  rejected with HTTP 403 rather than silently succeeding. Also drove the
  actual `OffboardModal` UI in the browser end-to-end (open → confirm →
  "Revoked. 0 active sessions terminated." → close → table row updates
  to "offboarded" with the action button now disabled, with no page
  reload). Re-seeded the database afterward to restore a clean baseline
  rather than leaving the two test-revoked employees in a dirty state.
- Still open, carried forward: rule-based anomaly detection, the fuller
  Policies UI (`sensitivePatterns`/`wsEndpoint` editing + audit trail),
  and dashboard charts/analytics are all still Phase 4 backlog, not
  touched in this pass. `getOrgKey()`/true org-tenant identity (distinct
  from the new per-*employee* identity) is still dead code. There is
  still no authentication on the revoke endpoint or on who can set an
  extension's local `employeeEmail` — both explicitly Phase 5 territory,
  not silently patched over here.

**Status: Phase 4 IAM Users & Geo-Compliance Asset Map — Users page, Asset Map, and the employee-identity plumbing behind both are COMPLETE and verified end-to-end.** Rule-based detection, the fuller Policies UI, and dashboard analytics remain open on the Phase 4 backlog.

## 2026-07-30 — Phase 5: Auth, API Security, and Audit Logging Layer

- **Two design decisions confirmed with the user before building anything**
  (both had real, non-obvious footprints): `ORG_ACCESS_KEY` is a brand
  new, separately-named credential — not a repurposing of the
  extension's existing vestigial `orgKey` (a random per-install device
  ID, never validated by anything, still untouched dead code) — since
  conflating "which device is this" with "is this request authorized"
  would be a code smell even though the field was sitting right there
  unused. And `BEARER_TOKEN` gates the *entire* dashboard (every page,
  not just mutating calls), matching PLAN.md's own Phase 5 framing
  ("Authentication/authorization for the dashboard **and** the API") —
  DLP alert content, employee PII, and now the audit trail itself
  shouldn't be viewable pre-login either.
- **Critical version-specific finding, verified directly against the
  installed Next docs, not training data** (per this repo's own
  `AGENTS.md` mandate): `node_modules/next/dist/docs` has no
  `middleware.md` at all — only `proxy.md`. As of **Next 16.0.0,
  `middleware.ts` is deprecated and renamed to `proxy.ts`**, exporting a
  `proxy(request: NextRequest)` function. Built `src/proxy.ts`, not
  `middleware.ts`. Proxy defaults to the Node.js runtime (not edge), so
  `src/lib/auth.ts`'s built-in `crypto` usage is safe there. Also
  confirmed by tracing Node's event model: WebSocket upgrade requests
  fire the `upgrade` event, never `request` — so `proxy.ts` structurally
  cannot run for `/api/ws` no matter what its matcher says; the WS-layer
  checks added to `server.ts` are the sole gate for that surface, not
  defense-in-depth stacked on top of proxy.
- **A real startup crash caught during verification, not assumed away**:
  first pass of `src/lib/auth.ts` imported `NextResponse` from
  `"next/server"` for its Route-Handler convenience wrappers. Since
  `server.ts` imports `@/lib/auth` at its top level — evaluated by `tsx`
  *before* `next({...})` ever runs — this crashed immediately on
  `npm run dev` with `Error: Invariant: AsyncLocalStorage accessed in
  runtime where it is not available`. Fixed by splitting the module:
  `src/lib/auth.ts` now has zero `next/server`/`next/headers` imports
  (pure `node:crypto` + string-in/string-out functions), while the new
  `src/lib/authGuards.ts` holds the two `NextResponse`-returning
  wrappers (`requireOrgAccessKey`, `requireDashboardSession`), imported
  only by Route Handlers — which Next always loads lazily through its
  own request pipeline, never by `server.ts`. Verified the fix by
  actually restarting the dev server and confirming clean boot, not just
  by reasoning about it.
- **Session mechanism**: HMAC-signed opaque cookie via built-in
  `node:crypto` (`createHmac`/`timingSafeEqual`), not a JWT library —
  this project needs exactly one shared secret with no per-user claims
  beyond an optional operator label, so `jose`'s framing/algorithm-
  negotiation machinery would be the first auth dependency added to a
  project that has zero today, for no real benefit. Format:
  `base64url(JSON({iat,exp,operator?})) + "." +
  hex(HMAC-SHA256(payload, SESSION_SECRET))`. `SESSION_SECRET` is a
  third, distinct env var from `BEARER_TOKEN` — the login credential and
  the cookie-signing key shouldn't be the same secret. All three secret
  comparisons (`ORG_ACCESS_KEY`, `BEARER_TOKEN`, the session HMAC) go
  through `timingSafeEqualStrings()`, which hashes both inputs to a
  fixed 32-byte SHA-256 digest before `crypto.timingSafeEqual` — that
  function throws on unequal-length buffers, so a naive
  `a.length === b.length` pre-check would leak length via
  timing/exception behavior; hashing first means it's always called
  with two equal-length buffers and can never throw.
- **`server.ts`**: WS upgrade handler now requires a valid
  `orgAccessKey` query param for `role=agent` and a valid session cookie
  (`req.headers.cookie`, read manually — this is a raw Node
  `IncomingMessage` in the `upgrade` event, no `NextRequest`/`cookies()`
  helper available here) for `role=dashboard`, both **401** and checked
  *before* the existing employee-status lookup — so an unauthenticated
  caller gets a uniform rejection with zero information leakage, unable
  to use the endpoint to probe whether a given `employeeEmail`
  exists/is active. The pre-existing offboarded-employee check stays
  **403** (distinguishing "who are you" from "that identity is
  forbidden"). Also captures the session's operator label at handshake
  time (`getSessionOperator`) and threads it into `handleDashboardMessage`
  for audit attribution — WS messages have no per-message cookie access,
  only the upgrade request does. Also: `next({dev})` → `next({dev,
  hostname: "localhost", port})`, keeping `proxy.ts`'s internal
  invocation URL correct if `PORT` is ever overridden (traced through
  `next/dist/server/next-server.js`'s `runMiddleware()`, which otherwise
  defaults to port 3000).
- **REST routes**: `/api/telemetry` POST requires `X-Org-Access-Key`
  (agent traffic); its GET requires the dashboard session instead (it's
  dashboard-debug data — recent alerts/heartbeats — the extension
  confirmed never calls `GET` at all). `/api/policies` (GET+POST) and
  `/api/employees/[id]/revoke` both require the dashboard session.
  **No client-side changes were needed** in `PolicyControlPanel.tsx`,
  `OffboardModal.tsx`, or `useWebSocket.ts` — verified empirically, not
  assumed: the httpOnly session cookie is same-origin and the browser
  auto-attaches it to both `fetch()` calls and the WS handshake once
  logged in, so every existing REST/WS call site kept working with zero
  header-threading changes.
- **Audit logging** (`src/lib/auditLog.ts`'s `logAuditEvent()`, new
  `AuditLog` model): wired into both policy-update paths (WS
  `handleDashboardMessage` and REST `POST /api/policies`), employee
  revoke, `ingestDlpEvent` (shared by the WS and REST ingestion paths,
  so both get it for free) — deliberately **not** every heartbeat
  (high-volume liveness pings, low audit value; confirmed via `sqlite3`
  query during testing that heartbeat POSTs produce zero audit rows,
  while a `dlp_event` POST produces exactly one) — and every auth
  failure (agent/dashboard WS rejections, failed logins). The
  auth-failure logging wasn't explicitly on the original list but is a
  textbook high-value audit use case directly complementary to the
  endpoint-security work in the same phase. `logAuditEvent()` never
  throws (a logging failure must never roll back the security action it
  describes) and broadcasts a new `audit_log` WS message to dashboard
  sockets so `/audit` updates live.
- **Login also captures an optional operator label** (confirmed with
  the user rather than defaulting silently) — carried in the signed
  session, used as `actorEmail` on that operator's subsequent
  dashboard-originated actions (falling back to the existing `updatedBy`
  string, then `"dashboard-ui"`, when absent). Without this, every
  action taken through the single shared `BEARER_TOKEN` would log under
  the same generic string, defeating the point of having an `actorEmail`
  column at all.
- **`src/proxy.ts`**: redirects to `/login?next=<path>` for page
  navigations, returns JSON 401 for `/api/*`, when the session check
  fails — for every path except `/login`, `/api/auth/login`, and
  `/api/telemetry` (excluded so legitimate `ORG_ACCESS_KEY`-authenticated
  agent POSTs aren't rejected by a blanket dashboard-session rule before
  reaching that route's own check). Per Next's own docs' explicit
  warning ("Always verify authentication and authorization inside each
  Server Function rather than relying on Proxy alone"), every Route
  Handler also self-guards — proxy is the primary gate, not the only
  one.
- **Restructured `src/app/`** into a `(dashboard)` route group
  (`page.tsx`, `users/`, `policies/`, `assets/`, and the new `audit/`
  moved inside it, each keeping its exact existing content) with its
  own `layout.tsx` rendering `<Sidebar/>` + `<main>`, so `/login`
  (outside the group) renders without a sidebar full of links that would
  all just redirect back to `/login` anyway — confirmed via screenshot
  that the unstyled version (sidebar bleeding into the login card) was a
  real, visible bug before this fix, not a hypothetical one. Root
  `layout.tsx` now only provides `<html>/<body>` + font loading.
- **`/login`** (`src/app/login/page.tsx`): token + optional operator
  label, posts to `/api/auth/login`, redirects to `?next=` on success.
  **`/api/auth/login`**: rate-limited (in-memory, `globalThis`-cached
  matching `wsRegistry.ts`'s pattern — 5 attempts/5min per IP, cheap
  defense-in-depth given the project's prototype maturity, not a
  substitute for a sufficiently random `BEARER_TOKEN`), logs
  `login_succeeded`/`login_failed`. **`/api/auth/logout`** clears the
  cookie; wired a "Log out" control into `Sidebar.tsx`'s footer,
  confirmed via browser that it actually clears the session (a
  subsequent page load redirects to `/login` again, not just that the
  button navigates away).
- **New `/audit` page**: `src/app/(dashboard)/audit/page.tsx` (real
  Prisma data, `take: 200` ordered by `timestamp desc`) +
  `src/components/audit/AuditLogTable.tsx` (presentational, matching
  `IncidentFeedTable.tsx`'s exact structure/styling) +
  `src/components/audit/LiveAuditTrail.tsx` (`"use client"`, live via
  the same `useWebSocket`-based pattern as `LiveIncidentFeed.tsx`, plus
  a text-search input and an action `<select>` filtering the
  already-fetched list client-side) — **the first search/filter UI in
  this codebase**, confirmed via grep there was no existing pattern to
  extract. Added `{href:"/audit", icon:ScrollText}` to `Sidebar.tsx`'s
  `NAV_ITEMS` (confirmed the icon exists in the installed `lucide-react`
  before using it).
- **Extension**: `extension/background/background.js` gained
  `getOrgAccessKey()`, mirroring `getEmployeeEmail()`'s exact
  managed-storage-first/no-anonymous-fallback shape, wired into
  `connectWebSocket()`'s URL construction as a third query param.
  `extension/options/options.html`/`options.js` gained a matching form
  field, generalizing the save/clear logic to loop over both identity
  fields instead of hardcoding just `employeeEmail`. An
  `orgAccessKey` change now also force-closes and reconnects the socket
  (same treatment `employeeEmail` changes already got), since a stale
  connection would otherwise sit under the wrong credential until it
  happened to drop on its own.
- **Verified end-to-end**, not just type-checked: `npm run lint` and
  `npx tsc --noEmit` clean throughout (including catching and fixing the
  AsyncLocalStorage crash above via an actual `npm run dev` restart, not
  assumed fixed from reading the diff). `curl` confirmed `POST
  /api/policies` with no cookie returns `401 {"error":"unauthorized"}`
  JSON (not an HTML redirect page) and `POST /api/telemetry` with a
  valid `X-Org-Access-Key` header succeeds with no dashboard cookie
  present, proving the proxy exclusion works. A scratch `ws`-based
  script confirmed all four WS-auth branches: agent with no key → 401,
  agent with a wrong key → 401, agent with the real key → open,
  dashboard with no cookie → 401. `sqlite3` confirmed `agent_auth_failed`
  / `dashboard_auth_failed` rows were actually written for those
  rejections. In a real Playwright browser: unauthenticated `/` redirect
  to `/login`, wrong-token rejection with an inline error message,
  correct-token-plus-operator login redirecting back to the original
  `next` page, Policy Control Panel push via the authenticated WS
  session ("Pushed via WebSocket", no client code changes), employee
  revoke via the authenticated REST session, `/audit` showing all of the
  above live with `"Arsad"` as `actorEmail` on the operator-attributed
  rows and `"unknown"` on the pre-login failures, search/filter
  narrowing the list correctly, and logout actually invalidating the
  session (confirmed by a second unauthenticated redirect, not just the
  logout button visually navigating away). Added `prisma.auditLog.deleteMany()`
  to `prisma/seed.ts`'s existing wipe-and-reseed step (a gap from
  building `AuditLog` mid-phase) and re-seeded afterward so test-only
  audit noise (auth failures, the test revoke, test policy toggles)
  doesn't linger as the first thing a fresh user sees on `/audit`.
- Still open, carried forward: legal/compliance review of DLP data
  collection and the Vercel deployment pipeline are both still Phase 5
  backlog, not touched in this pass — deploying this custom-server
  architecture to Vercel specifically still needs its own decision
  (Vercel's serverless functions can't hold the long-lived WS upgrade
  open at all, a gap flagged since Phase 3). Rate limiting on `/login`
  is IP-based and in-memory only — resets on process restart and doesn't
  survive multi-instance deployment, fine for this single-process local
  setup but would need a shared store (Redis, etc.) for real production
  use. No true per-user dashboard accounts exist — the optional operator
  label is self-reported at login, not verified identity.

**Status: Phase 5 Auth, API Security, and Audit Logging Layer — dashboard/API authentication and audit logging are COMPLETE and verified end-to-end.** Legal/compliance review and the Vercel deployment pipeline remain open on the Phase 5 backlog.

## 2026-07-31 — Phase 6: Automated E2E Testing & Hardening

- Explored the codebase from scratch before writing anything — this
  session had no memory of the Phase 3-WS/Phase 4/Phase 5 work (built in
  other sessions, per the commit history/PLAN.md already on disk), so
  read `server.ts`, `src/lib/auth.ts`, `authGuards.ts`, `wsRegistry.ts`,
  `auditLog.ts`, `telemetryIngest.ts`, `policyStore.ts`,
  `src/types/websocket.ts`, and every page/component the five required
  scenarios touch, rather than guessing at API shapes or WS message
  contracts.
- `@playwright/test` was already a `package.json` devDependency (from
  the earlier `chore(phase6)` commit) but had never actually been `npm
  install`ed — `node_modules/@playwright/test` didn't exist, so `npx
  playwright test` was resolving a *different*, globally-npx-cached
  `playwright` package that couldn't find it. Fixed with a plain `npm
  install` (added 9 packages) and then ran tests via the now-real
  `./node_modules/.bin/playwright` binary. Approved three more pending
  install scripts this surfaced (`esbuild`, `sharp`, `unrs-resolver`) via
  `npm approve-scripts` — same sandbox script-allowlist gate from Phase 2/3.
- `tests/env.ts`: single source of truth for the suite's port (3100),
  SQLite file (`prisma/e2e-test.db`), and `ORG_ACCESS_KEY`/
  `BEARER_TOKEN`/`SESSION_SECRET` test values, plus the one fixture
  `Employee` (`e2e.agent@insider-shield.dev`) and operator email
  (`e2e-operator@insider-shield.dev`) the whole suite is built around.
  Deliberately never reuses the developer's real `dev.db`/`.env`/port
  3000 — this suite cannot corrupt real dev data or collide with a dev
  server already running.
- `tests/global-setup.ts` / `global-teardown.ts`: wipe
  `e2e-test.db*` → `prisma migrate deploy` against it (applies the 3
  existing migrations non-interactively) → seed one `Employee` row →
  (teardown) wipe again after the run. Satisfies "DB initialization/
  reset before test runs" literally, every run, not just once.
- **Bug hit during implementation, not anticipated in the plan:**
  Prisma 7's generated client (`src/generated/prisma/client.ts`) is an
  ES module (`import.meta.url` at the top). Dynamically `import()`-ing
  it directly inside `global-setup.ts` threw `Cannot require() ES
  Module ... in a cycle` — something in Playwright's own config/setup
  module loading converts that into a `require()` under the hood, and
  Prisma's generated module graph has an internal cycle that Node's
  require(esm) interop explicitly refuses to resolve. Same category of
  Prisma-7-specific surprise as the driver-adapter requirement hit in
  the SQLite Data Persistence phase. Fixed by moving the seed into its
  own standalone script (`tests/seed-e2e-employee.ts`) run as a plain
  `tsx` child process from `global-setup.ts` via `execFileSync` — the
  exact same execution pattern `prisma/seed.ts` already uses
  successfully, which sidesteps Playwright's module graph entirely.
- `playwright.config.ts`: `webServer.command` is `npx tsx server.ts`
  (dev mode, no prior `next build` needed) — specifically *not*
  `next build && next start`, since (per the Phase 3 note still true
  today) stock `next start` never attaches the custom WS server at all.
  `workers: 1` / `fullyParallel: false` / `mode: "serial"` in the spec
  file, because the five scenarios are a genuine dependency chain (the
  offboarding test needs the still-open agent socket the telemetry test
  opened; the audit test needs the rows the earlier tests produced), not
  independent cases that happen to be easy to parallelize.
- `tests/e2e.spec.ts` — implementation notes on the trickier assertions:
  - **DLP broadcast without a reload**: the test explicitly waits for
    the Overview page's Live Incident Feed status dot to read "Live"
    (`getByText("Live", { exact: true })` — `exact` matters, since the
    feed's own heading is literally "Live Incident Feed" and would
    otherwise ambiguously match too) *before* sending the agent's
    `dlp_event` — `broadcast()` in `wsRegistry.ts` only fans out to
    sockets already registered at send time, so sending too early would
    make the row never appear and the test would have to reload to see
    it, defeating the point of the assertion.
  - **Policy Push → agent verification**: registers the
    `waitForMessage(agentSocket, m => m.type === "policy_update")`
    listener *before* clicking "Push Update" (not after), and separately
    waits for the Policies page's own "Live" status dot before clicking
    — the same race as above, on the dashboard-role socket's connection
    this time.
  - **Offboarding → 403 reconnect**: `terminateEmployeeSessions()`
    actually closes the live socket with code `4001` (not an HTTP status
    — that's a WS close code); the "403" in the task description refers
    to the *separate* reconnect attempt, which `server.ts`'s upgrade
    handler rejects at the HTTP level before the WS handshake completes.
    Asserted both, separately: `4001` on the original socket's `close`
    event, `403` via a *new* socket's `unexpected-response` event
    (`ws`'s event for "server replied with a non-101 status during
    upgrade"). Every `ws.WebSocket` instance gets a permanent no-op
    `error` listener the moment it's constructed — an unhandled `error`
    event on a Node `EventEmitter` throws and crashes the whole test
    process, which the first version of this file didn't have and would
    have hit right after the 403 rejection.
  - **Audit timestamps**: asserted with a loose `\d{1,2}:\d{2}:\d{2}`
    regex against the rendered cell text rather than `Date.parse()`-ing
    it — `AuditLogTable.tsx` renders timestamps via a locale-formatted
    `toLocaleString()`, which `Date.parse()` cannot reliably round-trip.
- Verified: `npx playwright test` (via the local binary) — **5/5 pass,
  twice in a row** (confirms the fresh-DB-per-run reset makes this
  deterministic, not order-dependent on leftover state from a previous
  run). `npm run build` (TypeScript check included) and `npm run lint`
  both still pass with `tests/*.ts` and `playwright.config.ts` now
  inside the tsconfig's broad `**/*.ts` include glob. Confirmed
  `prisma/dev.db`'s mtime is unchanged after the full run — the suite
  never touches the developer's real database.
- Added `"test:e2e": "playwright test"` to `package.json` scripts.
- Not done (out of scope for this task, flagging for later): no CI
  workflow wired up to actually run `npm run test:e2e` on push/PR; the
  suite covers the 5 specified scenarios only, not every route/edge case
  (e.g. rate-limited login, agent auth failure, geo-compliance map).

**Status: Phase 6 — Automated E2E Testing & Hardening COMPLETE.** All 5 required scenarios pass reproducibly against a disposable test database; `npm run build`/`lint` remain green.

## 2026-07-31 — Phase 7: Production Readiness & Deployment Configuration

- Checked what already existed before writing anything: no
  `Dockerfile`/`.dockerignore`/`render.yaml`, no `/api/health` route, no
  `docker` CLI or daemon available in this sandbox (`docker --version`:
  command not found). All of Phase 7 had to be written and verified
  through means other than an actual container run.
- `src/lib/prisma.ts`: added `isRemoteLibsqlUrl()` — branches
  `createClient()` on whether `DATABASE_URL` starts with `libsql://`,
  `http://`, or `https://`. Local `file:` URLs are unchanged
  (`@prisma/adapter-better-sqlite3`, confirmed via a full
  `npm run test:e2e` pass afterward — the e2e suite's own DB path
  exercises exactly this branch). The remote branch uses the new
  `@prisma/adapter-libsql` (installed at the exact same `7.9.1` version
  as the rest of the Prisma toolchain — checked `npm view
  @prisma/adapter-libsql dist-tags` rather than assuming a version) and
  throws a clear startup error if `TURSO_AUTH_TOKEN` is missing, instead
  of failing obscurely on the first query. No `prisma/schema.prisma`
  change needed — confirmed both adapters implement the same
  `provider = "sqlite"` datasource, only the driver differs.
- **Flag, not fixed (documented instead):** whether `prisma migrate
  deploy` itself works against a `libsql://` URL is unverified — no
  Turso account exists in this environment to test against, and
  Prisma's Rust-based schema-engine has historically not spoken the
  libsql/Hrana wire protocol directly (this is a documented real-world
  gap as of Prisma's driver-adapter rollout, not specific to this
  project). `README.md`'s deployment section says to try the direct
  path first and documents a fallback (`turso db shell < migration.sql`
  per migration) rather than asserting either way with false
  confidence.
- `src/app/api/health/route.ts` (new): runs `prisma.$queryRaw\`SELECT
  1\`` (a real connectivity check, not a hardcoded 200) and reads
  `agentSockets.size`/`dashboardSockets.size` directly from
  `src/lib/wsRegistry.ts` — genuinely live in-process state, the same
  registry `terminateEmployeeSessions()` already reads/writes, not a
  new parallel bookkeeping mechanism. 200 when the DB check passes, 503
  otherwise. Added `/api/health` to `src/proxy.ts`'s `PUBLIC_PATHS` —
  otherwise a container healthcheck (which can't present a dashboard
  session cookie) would always get a 401 and the container would be
  killed as unhealthy. Verified locally via `npm run dev` +
  `curl localhost:3000/api/health` → 200 with real `db`/`ws` fields.
- `package.json`: moved `@prisma/client`, `@prisma/adapter-better-sqlite3`,
  and `tsx` from `devDependencies` to `dependencies` — all three are
  imported directly by runtime code (`src/lib/prisma.ts`, `server.ts`),
  and the SQLite Data Persistence phase's own WORKLOG entry already
  flagged this as something that "would break under any `--omit=dev`
  production install" without fixing it (the instruction at the time
  was explicit about dev-dependency placement). Phase 7 is the point
  where that flag stops being theoretical, so fixed it now rather than
  re-flagging it a third time. Added `"start:prod": "tsx server.ts"`
  (kept `"start": "next start"` unchanged — still intentionally not
  wired to the custom WS server, per the existing Phase 3 note; adding
  a new script rather than repurposing the conventional one). Ran a
  plain `npm install` afterward to reconcile `package-lock.json`'s
  per-package dev/prod flags (560-line diff, no new packages — same
  tree, corrected classification).
- `Dockerfile` (new, multi-stage): `builder` (`node:22-bookworm-slim` +
  `python3 make g++ openssl` for better-sqlite3/sharp's native builds +
  Prisma's engine linking) runs `npm ci` then `npm run build`; `runner`
  (clean `node:22-bookworm-slim`, no compiler) copies the built
  `node_modules`/`.next`/`public`/`prisma`/`src`/`server.ts`/config files
  over and runs `node_modules/.bin/tsx server.ts` directly (exec form —
  not `npm run start:prod`, so `SIGTERM` from the platform reaches the
  actual process instead of an intermediate `npm` process that may not
  forward it). Deliberately does *not* prune devDependencies from the
  copied `node_modules`: `tsx` needs the TypeScript toolchain present at
  runtime (it compiles `server.ts` on the fly, unlike a pre-compiled JS
  server), and `prisma.config.ts` — needed if you exec into the running
  container to run `prisma migrate deploy` against production — imports
  `dotenv`, itself a devDependency. Added a Docker `HEALTHCHECK` calling
  Node's built-in global `fetch` against `/api/health` (Node 22 doesn't
  need `curl` installed just for this, keeping the runner image
  smaller). **Never run through `docker build`/`docker run`** — flagged
  prominently in the file's own header comment, in `PLAN.md`, and in
  `README.md`, rather than presented as tested.
- `.dockerignore` (new): excludes `node_modules`/`.next`/`.git`, local-only
  db files (`dev.db`, `e2e-test.db`, and their `-wal`/`-shm`/`-journal`
  companions), `.env` (keeps `.env.example`), `src/generated` (Prisma
  regenerates it fresh inside the image via `npm ci`'s `postinstall`),
  and `tests/`/`playwright.config.ts` (not needed in the runtime image —
  confirmed `next build`'s TypeScript pass, which globs `**/*.ts`
  broadly, doesn't care that these are simply absent from the build
  context).
- `render.yaml` (new): before writing it, used WebFetch against Render's
  own current blueprint-spec docs rather than assuming schema details
  from training data — confirmed `runtime: docker` is the current field
  name (`env: docker` is the older, now-discouraged form), `plan: free`,
  `healthCheckPath`, and the `generateValue`/`sync: false` envVar
  shapes. Defines one Docker web service on the free plan with
  `healthCheckPath: /api/health`; `ORG_ACCESS_KEY`/`BEARER_TOKEN`/
  `SESSION_SECRET` auto-generated by Render (`generateValue: true`),
  `DATABASE_URL`/`TURSO_AUTH_TOKEN` prompted for once (`sync: false`,
  since they come from an external Turso account Render has no way to
  generate).
- `README.md`: fully rewritten from the default create-next-app
  template (which was still in place — this project never had real
  setup docs until now) — local dev quickstart, `npm run test:e2e`, and
  a step-by-step Render + Turso deployment guide (Turso CLI install/
  account/db-create/token-create, schema application with the migrate-
  deploy-vs-turso-shell-fallback caveat from above, Render blueprint vs.
  manual service creation, the full env var reference table, a
  post-deploy step reminding to update the Chrome extension's
  `wsEndpoint`/`orgAccessKey` to point at the deployed URL, and a "known
  limitations" section stating plainly what was/wasn't verified and why
  Vercel isn't a supported target here). `.env.example` gained
  `TURSO_AUTH_TOKEN` with a comment explaining when it's required.
- Verified after all changes: `npm run build` (TypeScript check
  included, `/api/health` appears correctly as `ƒ` dynamic), `npm run
  lint`, and `npm run test:e2e` (5/5, exercising the unchanged local
  `file:`/better-sqlite3 adapter path end-to-end) all still pass.
- Not done (explicitly out of scope / genuinely unverifiable here, not
  silently skipped): no actual `docker build`, no real Turso database to
  migrate/seed against, no CI workflow to automate any of this. All
  three are called out as open items in `PLAN.md`'s Phase 7 section
  rather than marked complete.

**Status: Phase 7 — Production Readiness & Deployment Configuration is configuration-ready, not "verified in production."** Every piece that could be checked locally (build, lint, e2e against the local adapter path, the health endpoint) passes. The Docker build and the Turso migration path need a real Docker daemon and Turso account to confirm, neither of which exist in this environment — see the flags above before a first real deploy.
