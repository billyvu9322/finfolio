# AGENTS.md

## Repo Snapshot
- FinFolio is a pnpm workspace: `apps/api` (Fastify + Drizzle + PostgreSQL) and `apps/web` (Vite + React).
- Source-of-truth product docs: `docs/SRS.md`, phase task lists in `docs/phases/`, design guidance in `docs/DESIGN.md`.
- `CLAUDE.md` contains useful architecture notes, but verify against code first; some scaffold/status notes can lag behind current implementation.

## Commands
- Install from repo root: `pnpm install`.
- Run both apps: `pnpm dev`.
- Full build: `pnpm build`.
- API dev: `pnpm --filter @finfolio/api dev` at `http://localhost:6001` (`/docs` for Swagger).
- API verification: `pnpm --filter @finfolio/api typecheck` and `pnpm --filter @finfolio/api test`.
- Web verification: `pnpm --filter @finfolio/web typecheck`; web build is `pnpm --filter @finfolio/web build`.
- Root `pnpm lint` exists but package-level `lint` scripts are not currently defined; do not rely on lint until scripts are added.

## Environment And DB
- API loads env through `apps/api/src/config/env.ts`; missing/invalid `DATABASE_URL` or `JWT_SECRET` (min 32 chars) exits on boot.
- API local env: copy `apps/api/.env.example` to `apps/api/.env`. Web env: copy `apps/web/.env.example` to `apps/web/.env`.
- Local Postgres shortcut: `docker compose up db`, then API commands can use `postgresql://finfolio:finfolio@localhost:5432/finfolio`.
- Drizzle schema source: `apps/api/src/db/schema/index.ts`; migrations live in `apps/api/drizzle/`.
- DB commands: `pnpm --filter @finfolio/api db:migrate`, `db:push`, `db:generate`, `db:studio`, `db:seed`.
- API Docker image runs `tsx src/server.ts`; there is no emitted `dist` runtime despite `main` pointing at `dist/server.js`.

## API Conventions
- Entry flow: `src/server.ts` -> `src/app.ts` -> `src/routes.ts`; all API routes mount under `/v1`.
- Relative API imports use NodeNext-style `.js` specifiers even for `.ts` files. Match this in new API files.
- Route I/O is Zod via `fastify-type-provider-zod`; add schemas in `modules/<feature>/<feature>.schema.ts` rather than hand-validating in handlers.
- Central error handler maps `ZodError` to 400 and any error with 4xx `statusCode` to that status.
- Protected feature modules should call `fastify.addHook('onRequest', fastify.authenticate)`; public auth routes are under `/v1/auth`.
- Auth refresh tokens are opaque random tokens; only SHA-256 hashes are stored. Refresh cookie is httpOnly and scoped to `/v1/auth`.

## Money And Precision
- Drizzle returns Postgres `numeric` as strings. Do not use JS floating-point math for money or quantities.
- Financial calc engines should be pure and unit-tested first. Current Gold calc uses scaled `bigint`; preserve decimal-safe behavior.
- UI financial numbers should use tabular/mono styling and not rely on color alone for P&L meaning.

## Web Conventions
- Router is code-based TanStack Router in `apps/web/src/router.tsx`, not file-based routing.
- Auth state is Zustand persisted to localStorage for access token/user only; refresh token stays in httpOnly cookie.
- Use `apps/web/src/lib/api.ts` axios client for feature calls. It attaches bearer token and does single-flight refresh-on-401.
- Feature pages use TanStack Query for server data. Keep authenticated pages as children of `appRoute`.
- Vite alias `@` maps to `apps/web/src`.

## Testing Notes
- API tests use Vitest via `pnpm --filter @finfolio/api test`; test files are `src/**/*.test.ts`.
- No web test runner is configured yet; use `pnpm --filter @finfolio/web typecheck` and `pnpm --filter @finfolio/web build` for web verification.
- DB-backed tests or manual smoke need a live Postgres plus migrated/pushed schema. Pure unit tests should run without DB.

## Current Known Gaps
- No CI workflows or pre-commit config are present yet.
- Phase docs may include tasks not fully implemented; update checkboxes only after running the matching verification.
- Gold price scheduler/provider/manual refresh from the Phase 2 superpowers plan is not implemented yet; `/gold/prices` reads existing `price_cache` rows only.
