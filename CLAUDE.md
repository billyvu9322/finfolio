# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FinFolio — a personal capital-management web app (gold / Vietnamese stocks / crypto) per
[docs/SRS.md](docs/SRS.md). **Current state: scaffold only.** Infra, DB schema, and full
authentication exist; the Gold/Stock/Crypto/Dashboard/Reports feature modules are JWT-guarded
**stubs** with no business logic yet. Work is broken into phases in [docs/phases/](docs/phases/);
the design system + screen specs are in [docs/DESIGN.md](docs/DESIGN.md) (also a live Stitch project).

pnpm monorepo: `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web` (Vite + React).

## Commands

Run from repo root unless noted. Package manager is **pnpm** (workspaces).

```bash
pnpm install
pnpm dev                                  # api + web in parallel
docker compose up --build                 # full stack: db + api + web (+nginx)

# API (apps/api)
pnpm --filter @finfolio/api dev           # tsx watch, http://localhost:3000 (docs at /docs)
pnpm --filter @finfolio/api typecheck     # tsc --noEmit (this IS the build check; see below)
pnpm --filter @finfolio/api db:push       # sync schema → DB directly (easiest for dev)
pnpm --filter @finfolio/api db:migrate    # apply drizzle/ SQL migrations
pnpm --filter @finfolio/api db:generate   # regenerate migrations after editing schema
pnpm --filter @finfolio/api db:studio     # Drizzle Studio

# Web (apps/web)
pnpm --filter @finfolio/web dev           # http://localhost:5173
pnpm --filter @finfolio/web build         # tsc -b && vite build
```

Env: copy `apps/api/.env.example` → `apps/api/.env` (dotenv loads it; `JWT_SECRET` must be ≥32 chars
or the API exits on boot). Web reads `VITE_API_BASE_URL` from `apps/web/.env`.

There is **no test runner wired up yet** — phases call for ≥70% coverage (see docs/phases); add the
runner (e.g. vitest) when starting Phase 1 hardening or Phase 2.

## Non-obvious conventions

- **Runs via `tsx`, no compiled build.** The API has no `dist/`; `start` and the Dockerfile both run
  `tsx src/server.ts`. `pnpm build`/`typecheck` is `tsc --noEmit` purely for type checking. Don't add
  a `dist` build step expecting Node to run it.
- **ESM with explicit `.js` import extensions.** Relative imports in `apps/api` are written
  `./foo.js` even though the file is `foo.ts` (NodeNext/ESM convention). Match this in new API files.
- **Zod is the single source of truth for API I/O.** Routes are typed via `fastify-type-provider-zod`
  (`FastifyPluginAsyncZod`); request/response schemas are Zod objects. Validation + serialization run
  at the route layer — don't hand-write validation. The central error handler in `src/app.ts` maps
  `ZodError`→400 and any error with a 4xx `statusCode` (e.g. `AuthError`) to that status.
- **Money/precision:** all monetary and quantity columns are Postgres `numeric` (Drizzle returns
  strings) — do math with a decimal-safe approach, never JS floats. Crypto qty is `numeric(30,8)`.
  DESIGN.md mandates tabular-mono rendering, ≥2-decimal accuracy, signed P&L with color+icon (not color alone).

## Architecture

### API (`apps/api/src`)
- `server.ts` → `app.ts`: `buildApp()` wires plugins (helmet, cors, cookie, rate-limit 100/min,
  `authPlugin`, `swaggerPlugin`), the Zod compilers, the central error handler, then mounts
  `routes.ts` under **`/v1`**.
- `routes.ts` registers each feature module under a prefix (`/auth`, `/gold`, `/stocks`, `/crypto`,
  `/dashboard`, `/reports`). Feature modules currently just `addHook('onRequest', fastify.authenticate)`
  and a TODO — implementing a phase means filling in `*.service.ts` + `*.routes.ts` there.
- `plugins/auth.ts` decorates `fastify.authenticate` (JWT verify guard) and augments
  `FastifyRequest.user` with `{ sub, email }`.
- `db/index.ts`: one shared `postgres-js` pool (`max: 20`) + Drizzle instance. `db/schema/*` is the
  schema source of truth; `db/schema/index.ts` re-exports all tables. Migrations live in
  `apps/api/drizzle/` (a hand-authored `0000_init.sql` + `meta/_journal.json` so `db:migrate` works
  before any `db:generate`).
- `config/env.ts`: Zod-validated env, imported early; invalid env → `process.exit(1)`.

**Auth model** (`modules/auth`): bcryptjs (cost 12) password hashing. Login/register issue a 15-minute
JWT **access token** and a 30-day opaque **refresh token** — the refresh token is random bytes,
**only its SHA-256 hash is stored** in `refresh_tokens`, and it's delivered as an httpOnly cookie scoped
to `/v1/auth`. `/auth/refresh` **rotates** (revokes old row, issues new). Logout revokes. Auth endpoints
are rate-limited to 5/min per-route (on top of the global 100/min).

### Web (`apps/web/src`)
- **Code-based TanStack Router** (not file-based) in `router.tsx`: a public `loginRoute` and an
  authenticated shell `appRoute` (renders `AppLayout`) whose `beforeLoad` redirects to `/login` when
  `useAuthStore` isn't authenticated. All feature pages are children of `appRoute`; most are
  `PagePlaceholder` until their phase lands.
- `stores/auth.ts`: Zustand store, **persisted to localStorage** (access token + user). The refresh
  token is never in JS — it's the httpOnly cookie.
- `lib/api.ts`: axios instance with `withCredentials`. Request interceptor attaches the bearer token;
  response interceptor does **single-flight refresh-on-401** (one `/auth/refresh`, replay the original;
  on failure clears auth). New feature data-fetching should go through this `api` client + TanStack Query.
- Tailwind dark-first; design tokens/components per [docs/DESIGN.md](docs/DESIGN.md). `lib/utils.ts`
  exports `cn()` (clsx + tailwind-merge, shadcn convention).

### Adding a feature module (the repeating pattern, see docs/phases 2–4)
1. Drizzle schema already exists in `db/schema/` — extend if needed, then `db:push`/`db:generate`.
2. API: write `modules/<x>/<x>.schema.ts` (Zod), `<x>.service.ts` (calc + DB, **unit-tested**),
   replace the stub `<x>.routes.ts`. The calc engines (DCA/WAVG, P&L, fees/tax) are the
   correctness-critical core — see SRS §10.1.
3. Web: build the portfolio screen + add/edit form against the Stitch designs, wiring the `api` client.

## Source of truth docs
- [docs/SRS.md](docs/SRS.md) — full requirements, FR-IDs, DB design (§6), formulas (§10).
- [docs/phases/](docs/phases/) — phased work breakdown with task checklists traced to FR-IDs.
- [docs/DESIGN.md](docs/DESIGN.md) — design system, tokens, per-screen specs.
