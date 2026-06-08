# Phase 1 — Foundation

> Infra, database, authentication, CI. **Status: 🟡 scaffold complete, hardening pending.**

## Goal

A runnable monorepo where a user can register, log in, stay logged in across refresh, and
log out — backed by a migrated PostgreSQL schema, with CI green. Everything later phases
build on.

## Delivers (SRS)

FR-AUTH-01..05 · NFR 4.2 (security) · NFR 4.4 (maintainability) · §6 (DB) · §2.1 (architecture).

## Already done (scaffold)

- [x] pnpm monorepo (`apps/api`, `apps/web`), `tsconfig.base`, `.gitignore`, `.env.example`.
- [x] docker-compose: `db` + `api` + `web`; per-app Dockerfiles + nginx SPA config.
- [x] API: Fastify 5 + plugins (helmet, cors, cookie, rate-limit, swagger), Zod type provider, central error handler.
- [x] DB: Drizzle schema for all SRS tables + `refresh_tokens`; `drizzle/0000_init.sql` + journal.
- [x] Auth module: register/login/refresh/logout/me — bcrypt(12), 15m access JWT, 30d rotating refresh (httpOnly cookie), 5/min rate limit.
- [x] Web: Vite + React + TanStack Router/Query + Tailwind + Zustand; axios client w/ refresh-on-401; guarded route tree; functional Login page; placeholder screens.

## Remaining tasks

### API
- [ ] FR-AUTH-01: send confirmation email on register (email provider abstraction; dev = log/preview).
- [ ] FR-AUTH-04: forgot-password flow — issue 1-hour reset token, `POST /auth/forgot`, `POST /auth/reset`.
- [ ] FR-AUTH-05: `PATCH /auth/profile` — display name, default currency (VND/USD), timezone.
- [ ] `GET /v1/health` deep check (DB ping).
- [ ] Structured pino logging levels via env; request-id.
- [ ] Seed script (demo user + sample data) for local dev.
- [ ] Unit tests: auth service (hash, token rotation, revoke), env validation.

### Web
- [ ] Register page wired to API (live password-strength: ≥8, uppercase, number).
- [ ] Forgot-password + Reset-password pages (Stitch screens exist).
- [ ] Settings → profile form (currency, timezone) → `PATCH /auth/profile`.
- [ ] Auth bootstrap: on load, call `/auth/me`; global 401 → redirect login.
- [ ] Toast + inline form errors from Zod messages.

### Infra / CI
- [ ] CI pipeline: install → typecheck → lint → test → build (API + Web) on PR.
- [ ] `db:migrate` step in CI against ephemeral Postgres.
- [ ] Pre-commit: lint-staged + typecheck.
- [ ] `.env.example` ↔ env schema parity check.

## Acceptance criteria

- [ ] `pnpm install && docker compose up` → register, login, refresh-survives-reload, logout all work end-to-end.
- [ ] `pnpm --filter @finfolio/api db:migrate` applies cleanly to empty DB.
- [ ] Auth endpoints reject bad input (Zod 400) and rate-limit at 5/min.
- [ ] CI green on a clean checkout.
- [ ] Auth service unit tests ≥ 70% coverage.
