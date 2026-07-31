# Insider-Shield — production image (Phase 7)
#
# Two stages: `builder` compiles everything (needs devDependencies —
# TypeScript/Tailwind/ESLint config are required at `next build` time,
# and better-sqlite3/sharp need a C toolchain to compile their native
# bindings); `runner` copies the already-built node_modules/.next/source
# into a clean base image, so the final image never needs a compiler.
#
# Runs the *custom* server.ts (via tsx), not `next start` — stock
# `next start` never attaches the `ws` WebSocket server this app relies
# on for real-time DLP/policy/audit updates (see PLAN.md's Phase 3
# notes). This is why node_modules is copied unpruned (devDependencies
# included) rather than a `--omit=dev` production install: `tsx` compiles
# server.ts and its `@/lib/*` imports on the fly, so the TypeScript
# toolchain must still be present at runtime, and `prisma.config.ts`
# (needed if you exec into the container to run `prisma migrate deploy`)
# needs `dotenv`, itself a devDependency.
#
# NOT build-tested in the sandbox this was authored in (no Docker daemon
# available there) — see README.md's deployment section and WORKLOG.md
# for what to verify on first real build/deploy.

FROM node:22-bookworm-slim AS builder

# python3/make/g++: node-gyp toolchain for better-sqlite3/sharp's native
# bindings. openssl: Prisma's schema/query engines link against it.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Node 22 has a built-in global fetch — no curl needed in the image just
# for this. Matches src/app/api/health/route.ts's 200/503 contract.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Runs `prisma migrate deploy` — NOT `db push` — every time the
# container starts, before the app itself boots. migrate deploy only
# applies the already-reviewed, already-committed migration files in
# prisma/migrations/ in order; it never diffs/drops/alters anything
# speculatively, so it can't silently discard production data the way
# `db push --accept-data-loss` can. This is also the point where
# DATABASE_URL/TURSO_AUTH_TOKEN are actually the real production
# values — Render injects them into the running container, not into
# the `docker build` step above, so this can't run any earlier than
# container start and still see the right database. If a migration
# ever genuinely conflicts with existing data, this fails loudly and
# the container never starts serving traffic with a broken schema,
# which is the correct failure mode — not something to "fix" by
# switching to a command that pushes through such conflicts instead.
#
# sh -c form (not exec form) so SIGTERM still reaches the tsx process:
# `exec` replaces the shell with the final command instead of leaving
# it as a child, so the platform's stop signal still hits the real
# process directly.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node_modules/.bin/tsx server.ts"]
