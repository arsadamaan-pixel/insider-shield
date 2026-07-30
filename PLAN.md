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

### Phase 5 — Hardening, Compliance & Deployment — ⏳ PENDING
- [ ] Authentication/authorization for the dashboard and API.
- [ ] Legal/compliance review of DLP data collection (notice, consent,
      data retention, jurisdiction) before enabling real capture.
- [ ] Vercel deployment pipeline and environment configuration.

## Active Milestone

**Phase 4 — Detection, Geo-Compliance & Dashboard UX** is in progress as
of 2026-07-30. The IAM Users page (with a real offboard/revoke action)
and the Geo-Compliance Asset Map are both complete, along with the
employee-identity plumbing needed to make revoke genuinely per-employee.
Rule-based anomaly detection, the fuller Policies UI, and dashboard
charts/analytics remain open (see Phase 4 checklist above). Phases 1–3
are complete.
