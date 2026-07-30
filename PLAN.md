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

### Phase 4 — Detection, Geo-Compliance & Dashboard UX — ⏳ PENDING
- [ ] Rule-based anomaly detection on ingested events.
- [ ] Interactive asset map (Leaflet / React-Leaflet) with GeoIP helpers.
- [ ] Fuller Policies UI for remote OTA rule authoring/distribution —
      `sensitivePatterns` and `wsEndpoint` editing, plus an audit trail.
      The minimal Policy Control Panel added in Phase 3 covers
      `dlpEnabled`/`transmitEvents`/`heartbeatIntervalMs` only.
- [ ] Charts/analytics on the dashboard overview (Recharts).
- [ ] Migrate `users/` and `assets/` placeholder pages off `mockData.ts`
      onto the same Prisma queries `page.tsx`/`policies/` now use (out
      of scope for the SQLite persistence task, left on mock data for
      now — they still render correctly, just not from the DB).

### Phase 5 — Hardening, Compliance & Deployment — ⏳ PENDING
- [ ] Authentication/authorization for the dashboard and API.
- [ ] Legal/compliance review of DLP data collection (notice, consent,
      data retention, jurisdiction) before enabling real capture.
- [ ] Vercel deployment pipeline and environment configuration.

## Active Milestone

**Phase 3 — Dashboard & Ingestion Foundation is now COMPLETE** as of
2026-07-30: dashboard UI, the two ingestion API routes, SQLite
persistence, and the real-time WebSocket transport are all done (see
Phase 3 checklist above). Phase 1 and Phase 2 are complete. Phase 4
(Detection, Geo-Compliance & Dashboard UX) is next.
