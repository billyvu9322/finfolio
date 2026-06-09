# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FinFolio — a personal capital-management web app (gold / Vietnamese stocks / crypto) per
[docs/SRS.md](docs/SRS.md). **Phases 1–5 are implemented** (auth + profile, gold, stock, crypto,
dashboard + reports) with real services, calc engines, and unit/integration tests. In flight:
**Phase 6** (polish/launch hardening), **Phase 7** (exchange-sync — replace the seed market-data
providers with real exchange/price feeds), and a **crypto AI-alert** feature (LLM env wiring exists
in compose/`env.ts`; no application code yet — see [docs/superpowers/](docs/superpowers/)).
Phase breakdown + FR traceability live in [docs/phases/](docs/phases/); design system + screen specs
in [docs/DESIGN.md](docs/DESIGN.md) (also a live Stitch project).

pnpm monorepo: `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web` (Vite + React).

## Commands

Run from repo root unless noted. Package manager is **pnpm** (workspaces).

```bash
pnpm install
pnpm dev                                  # api + web in parallel

# API (apps/api)
pnpm --filter @finfolio/api dev           # tsx watch on PORT 6001, docs at /docs
pnpm --filter @finfolio/api test          # vitest run (tests in apps/api/tests/)
pnpm --filter @finfolio/api test:coverage # vitest + v8 coverage (phases target ≥70%)
pnpm --filter @finfolio/api typecheck     # tsc -p tsconfig.json (noEmit — this IS the build check)
pnpm --filter @finfolio/api db:push       # sync schema → DB directly (easiest for dev)
pnpm --filter @finfolio/api db:migrate    # apply drizzle/ SQL migrations
pnpm --filter @finfolio/api db:generate   # regenerate migrations after editing schema
pnpm --filter @finfolio/api db:seed       # tsx src/db/seed.ts (seed users/prices/symbols)
pnpm --filter @finfolio/api db:studio     # Drizzle Studio

# Run a single test / one file
pnpm --filter @finfolio/api test cryptoMath        # filter by name substring
pnpm --filter @finfolio/api test tests/modules/gold/gold.calc.test.ts
pnpm --filter @finfolio/api exec vitest -t "weighted average"   # filter by test title

# Web (apps/web) — no test runner wired; build IS the typecheck gate
pnpm --filter @finfolio/web dev           # http://localhost:5173
pnpm --filter @finfolio/web build         # tsc -b && vite build
```

Env: copy `apps/api/.env.example` → `apps/api/.env` (dotenv loads it; `JWT_SECRET` must be ≥32 chars
or the API exits on boot). Web reads `VITE_API_BASE_URL` from `apps/web/.env`. `ENABLE_PRICE_SCHEDULER`
toggles the cron jobs (see below); `LLM_*` / `COINGECKO_API_KEY` / `EXCHANGERATE_API_KEY` are for the
in-flight AI-alert and Phase 7 work.

## Deployment (single image)

The root [Dockerfile](Dockerfile) builds **one image**: Vite builds the SPA, then the **Fastify API
also serves the built SPA** from `WEB_STATIC_DIR` via `@fastify/static` (with an SPA fallback that
returns `index.html` for non-`/v1`, non-`/docs` GETs — see `app.ts`). There is **no nginx and no
separate web container** (those were removed). The API still runs via `tsx` — there is no compiled
API `dist` despite `outDir` in tsconfig (`noEmit: true`).

```bash
docker compose up --build                 # single `app` service on API_PORT (default 6001)
```

`docker-compose.yml` runs only the `app` service; **PostgreSQL is external** (host DB reached via
`host.docker.internal`, set `DATABASE_URL`), and a **Cloudflare Tunnel** fronts it in production.

## Non-obvious conventions

- **Runs via `tsx`, no compiled build.** `start` and the Dockerfile both run `tsx src/server.ts`.
  `build`/`typecheck` are `tsc -p tsconfig.json` with `noEmit: true` — purely type checking. Don't add
  a `dist` build step expecting Node to run it.
- **ESM with explicit `.js` import extensions.** Relative imports in `apps/api` are written
  `./foo.js` even though the file is `foo.ts` (NodeNext/ESM convention). Match this in new API files.
- **Zod is the single source of truth for API I/O.** Routes are typed via `fastify-type-provider-zod`
  (`FastifyPluginAsyncZod`); request/response schemas are Zod objects. Validation + serialization run
  at the route layer — don't hand-write validation. The central error handler in `src/app.ts` maps
  `ZodError`→400 and any error with a 4xx `statusCode` (e.g. `AuthError`) to that status.
- **Money/precision uses `decimal.js`.** All monetary and quantity columns are Postgres `numeric`
  (Drizzle returns **strings**) — the calc engines (`gold.calc.ts`, `stockMath.ts`, `cryptoMath.ts`)
  do math with `decimal.js`, never JS floats. Crypto qty is `numeric(30,8)`. DESIGN.md mandates
  tabular-mono rendering, ≥2-decimal accuracy, signed P&L with color+icon (not color alone).

## Architecture

### API (`apps/api/src`)
- `server.ts` → `app.ts`: `buildApp()` wires plugins (helmet, cors, cookie, rate-limit 100/min,
  `authPlugin`, `swaggerPlugin`, **`schedulerPlugin`**), the Zod compilers, the central error handler,
  mounts `routes.ts` under **`/v1`**, then registers the static-SPA handler.
- `routes.ts` registers a `/health` check (pings DB) and each feature module under a prefix: `/auth`
  (public), `/gold`, `/stocks`, `/crypto`, `/dashboard`, `/reports` (each guards itself via
  `fastify.authenticate`).
- `plugins/auth.ts` decorates `fastify.authenticate` (JWT verify guard) and augments
  `FastifyRequest.user` with `{ sub, email }`.
- `plugins/scheduler.ts`: **node-cron** jobs, gated by `ENABLE_PRICE_SCHEDULER`. `refreshStockPrices`
  runs every 5 min (`*/5 * * * *`); `snapshotAllUsers` (portfolio snapshots) runs daily at `0 0 * * *`.
  Both `.stop()` on `onClose`.
- `db/index.ts`: one shared `postgres-js` pool (`max: 20`) + Drizzle instance. `db/schema/*` is the
  schema source of truth (`users`, `refresh-tokens`, `password-reset-tokens`, `gold/stock/crypto-
  transactions`, `dividend-events`, `portfolio-snapshots`, `price-cache`, `enums`); `schema/index.ts`
  re-exports all tables. Migrations live in `apps/api/drizzle/`.
- `config/env.ts`: Zod-validated env, imported early; invalid env → `process.exit(1)`.

**Auth model** (`modules/auth`): bcryptjs (cost 12) password hashing. Login/register issue a 15-minute
JWT **access token** and a 30-day opaque **refresh token** — the refresh token is random bytes,
**only its SHA-256 hash is stored** in `refresh_tokens`, delivered as an httpOnly cookie scoped to
`/v1/auth`. `/auth/refresh` **rotates** (revokes old row, issues new). Logout revokes. **Password reset**
uses single-use hashed tokens in `password_reset_tokens`. Auth endpoints are rate-limited to 5/min
per-route (on top of the global 100/min).

**Market data** (`modules/{stock,crypto}/market`): a `MarketDataProvider` / `CryptoDataProvider`
**interface** with a `Seed*` implementation currently in use (deterministic stub prices/candles).
Prices land in the `price-cache` table; services treat cache older than ~15 min as stale. **Phase 7**
swaps in real exchange/price providers behind the same interface — extend the provider, don't change
callers.

### Web (`apps/web/src`)
- **Code-based TanStack Router** (not file-based) in `router.tsx`: a public `loginRoute` + an
  authenticated shell `appRoute` (renders `AppLayout`) whose `beforeLoad` redirects to `/login` when
  `useAuthStore` isn't authenticated. Feature pages live under `features/<x>/` (auth, gold, stock,
  crypto, dashboard, reports, settings).
- `stores/auth.ts`: Zustand store, **persisted to localStorage** (access token + user). The refresh
  token is never in JS — it's the httpOnly cookie. `features/auth/AuthBootstrap.tsx` restores session.
- `lib/api.ts`: axios instance with `withCredentials`. Request interceptor attaches the bearer token;
  response interceptor does **single-flight refresh-on-401** (one `/auth/refresh`, replay the original;
  on failure clears auth). Feature data-fetching goes through this `api` client + TanStack Query.
- Charts: **lightweight-charts** (candles) + **recharts** (allocation/breakdown). Tailwind dark-first;
  tokens/components per [docs/DESIGN.md](docs/DESIGN.md). `lib/utils.ts` exports `cn()` (clsx +
  tailwind-merge, shadcn convention).

### Adding a feature module (the repeating pattern)
1. Drizzle schema already exists in `db/schema/` — extend if needed, then `db:push`/`db:generate`.
2. API: `modules/<x>/<x>.schema.ts` (Zod), a calc engine (`*.calc.ts` / `*Math.ts`, **decimal.js,
   unit-tested** — the correctness-critical core, see SRS §10.1), `<x>.service.ts` (calc + DB),
   `<x>.routes.ts`. Add tests under `apps/api/tests/modules/<x>/`.
3. Web: build the portfolio screen + add/edit form under `features/<x>/`, wiring the `api` client.

## Source of truth docs
- [docs/SRS.md](docs/SRS.md) — full requirements, FR-IDs, DB design (§6), formulas (§10).
- [docs/phases/](docs/phases/) — phased work breakdown with task checklists traced to FR-IDs.
- [docs/DESIGN.md](docs/DESIGN.md) — design system, tokens, per-screen specs.
- [docs/superpowers/](docs/superpowers/) — plans + specs for in-flight work (crypto AI-alert, Phase 7).
