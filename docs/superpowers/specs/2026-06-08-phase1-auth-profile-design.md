# Phase 1 (partial) — Profile & Auth Wiring — Design

> **Date:** 2026-06-08
> **Phase:** 1 (Foundation), email-dependent items deferred
> **Status:** Approved for planning

## Scope

Complete the non-email portion of Phase 1 ([../../phases/phase-1-foundation.md](../../phases/phase-1-foundation.md)).

**In scope:**
- `PATCH /auth/profile` — update display name, default currency (VND/USD), timezone (FR-AUTH-05).
- `GET /v1/health` deep check — DB ping.
- Web: real **Register** page, real **Settings → profile** form, auth bootstrap via `/auth/me`.
- Token-hash helper extraction (`token.util.ts`) + refactor refresh to use it.
- Dev seed script (demo user).
- Vitest set up in `apps/api` with unit tests for pure logic.

**Deferred (email-dependent — not this build):**
- Email confirmation / verification (FR-AUTH-01 email part).
- Forgot / reset password (FR-AUTH-04).
- `EmailService`, `verification_tokens` table, SMTP.
- CI pipeline (involves git; out of scope per user instruction — no git this build).

**Explicitly NOT changing:** existing register/login/refresh/logout/me behavior (beyond the additive `/me` is unchanged), the DB schema (no new tables/columns — `users` already has `display_name`, `currency`, `timezone`).

## Rationale / approach

Extend the existing `auth` module following established patterns (Zod-typed routes, service layer,
central error handler) rather than introducing new structure. No new tables: the profile fields
already exist on `users`. Email features are cleanly excised so they can be added later without
rework (profile and wiring don't depend on them).

## API design (`apps/api`)

### `PATCH /v1/auth/profile` (new, JWT-guarded)
- Body (all optional, at least one required): `displayName: string(1..120)`, `currency: 'VND'|'USD'`, `timezone: string`.
- Behaviour: update the authenticated user (`request.user.sub`), set `updated_at = now()`, return the public user object (same shape as `/auth/me`).
- Validation: Zod. Empty body → 400.
- Errors: user-missing → 401 (`AuthError`), reuses central handler.

### `GET /v1/health` (modify)
- Run `SELECT 1` against the pool; respond `{ status: 'ok', db: 'up' }` or `503 { status, db: 'down' }`.
- Unauthenticated (system route).

### `token.util.ts` (refactor, no behaviour change)
- Extract `hashToken(raw): string` (sha256 hex) and `generateToken(bytes=48): string` (base64url) out of `auth.service.ts`.
- Refresh-token logic imports from the util. Pure, unit-testable.

### Seed (`scripts/seed.ts`, `db:seed`)
- Idempotent: upsert a demo user (`demo@finfolio.vn`, known password) if absent. For local dev only; never run in prod.

## Web design (`apps/web`)

### RegisterPage (new) — route `/register` (public)
- Fields: email, password (show/hide), confirm password, display name (optional).
- Live password strength checklist: ≥8 chars, uppercase, number (mirrors API `registerBodySchema`); submit disabled until valid + passwords match.
- On submit → `register()` → store `{accessToken, user}` in auth store → redirect `/dashboard`.
- Error → inline message. Link back to `/login`. Login page gets a "Đăng ký" link.

### SettingsPage (replace placeholder) — route `/settings` (guarded)
- Profile form: display name input, currency segmented (VND/USD), timezone select. Pre-filled from current user.
- Save → `updateProfile()` → update auth store user → success toast. Dirty-tracking; Save disabled when unchanged.

### Auth bootstrap
- In `AppLayout`, a TanStack Query `['me']` calls `GET /auth/me` on mount to hydrate the store user from the server (keeps reload state truthful). On 401 the axios interceptor already clears + the route guard redirects to `/login`.

### Client plumbing
- `auth.api.ts`: add `updateProfile(payload): Promise<AuthUser>`.
- `stores/auth.ts`: add `setUser(user)` to update profile without touching the token.

## Data flow

```
Register:  RegisterPage → api POST /auth/register → {accessToken,user} → authStore.setAuth → /dashboard
Profile:   SettingsPage → api PATCH /auth/profile → user → authStore.setUser → toast
Bootstrap: AppLayout mount → useQuery(/auth/me) → authStore.setUser ; 401 → interceptor clear → guard → /login
Health:    GET /v1/health → SELECT 1 → {status, db}
```

## Components & boundaries

| Unit | Does | Depends on |
|---|---|---|
| `auth.routes.ts` (+profile) | HTTP I/O, Zod schemas, guard | auth.service |
| `auth.service.ts` (+updateProfile) | user reads/writes, mapping | db, token.util |
| `token.util.ts` | hash + random token (pure) | node:crypto |
| `RegisterPage` / `SettingsPage` | forms, validation, calls | auth.api, authStore, router |
| `auth.api.ts` | typed API calls | lib/api (axios) |

## Testing

- Add **vitest** + `test` script to `apps/api`.
- **Pure unit tests (no DB):**
  - `token.util`: `hashToken` deterministic + matches known sha256; `generateToken` unique, base64url, correct length.
  - `registerBodySchema` / profile schema: accept valid, reject short/no-uppercase/no-number, reject empty profile body.
  - `authService.toPublic`: strips `passwordHash`, maps fields.
- **Integration tests (DB-gated):** `fastify.inject` for `/auth/profile` (200 update, 401 no-token, 400 empty) and `/health`. Wrapped to **skip when `DATABASE_URL` is unset** so the suite runs anywhere.
- Coverage goal centered on pure logic; DB paths covered when a test Postgres is available.

## Acceptance criteria

- [ ] `PATCH /auth/profile` updates fields, returns updated user, rejects empty/invalid body, requires auth.
- [ ] `GET /health` reflects real DB reachability.
- [ ] Register page creates an account and lands authenticated on the dashboard; strength rules enforced client-side.
- [ ] Settings profile form loads current values, saves, and the change persists across reload (verified via `/auth/me`).
- [ ] `pnpm --filter @finfolio/api test` runs green; pure-logic tests pass without a database.
- [ ] No regression to existing login/logout/refresh.

## Out of scope (restated)

Email verification, forgot/reset password, EmailService/SMTP, new DB tables, CI, git operations.
