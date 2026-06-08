# Phase 6 — Polish & Launch — Design

> **Date:** 2026-06-08
> **Phase:** 6 (Polish & Launch)
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-6-polish-launch.md](../../phases/phase-6-polish-launch.md)

## Scope

This phase is **ops / hardening / docs**, not feature work. It splits into two buckets:

1. **Buildable now** (independent of feature implementation) — the subject of this spec+plan:
   test/coverage tooling, production deploy artifacts (Cloudflare Tunnel + external PostgreSQL +
   release zip), web a11y/perf foundations, backup/logging ops scripts, and launch docs.
2. **Verify-later gates** (require Phases 1–5 implemented) — kept as a checklist in the phase doc,
   **not** built here: coverage ≥70% repo-wide, E2E happy-path, perf thresholds (API P95 <300ms,
   FCP <2s, bundle ≤250KB), load test ≥50 users, OWASP audit, backup restore-test.

**Excluded:** CI pipeline (depends on git; this build uses no git) — noted as "add when git is enabled".
nginx (Cloudflare Tunnel handles ingress/TLS). Bundled Postgres (server already has one).

## Deployment model (authoritative)

Production runs on a Docker VM that already has **PostgreSQL** and a **Cloudflare Tunnel**:
- **No nginx**, **no `db` container**. The API connects to the existing PG via `DATABASE_URL`.
- Cloudflare Tunnel terminates TLS and routes the public hostname → the web container, and `/v1/*` → the api container. App containers bind `127.0.0.1` only.
- Release is delivered as a **zip**, unpacked on the VM, built, migrated, and started with `docker-compose.prod.yml`.

## Decisions

- **Coverage tool:** `@vitest/coverage-v8`; `test:coverage` script; provider `v8`, reporters `text` + `html`. Thresholds are configured but **commented/soft** until all phases land (so coverage of partial code doesn't fail the run). Documented how to flip them on.
- **Prod compose:** a separate `docker-compose.prod.yml` (api + web only). The existing root `docker-compose.yml` stays as the **local dev** stack (keeps `db` for convenience).
- **Migrations on deploy:** a one-shot `scripts/migrate.sh` runs `pnpm --filter @finfolio/api db:migrate` against the prod `DATABASE_URL` before `up -d`.
- **Web code-splitting:** convert the code-based TanStack routes to `React.lazy` components behind a `<Suspense>` fallback; chart libraries (`recharts`, `lightweight-charts`) load only inside their lazy page chunks (already true once the pages are lazy — verify no eager top-level chart import leaks into the entry bundle).
- **a11y:** global `:focus-visible` ring, `prefers-reduced-motion` reset, a skip-to-content link in `AppLayout`, `aria-label`s on icon-only buttons.
- **Backup:** `scripts/backup.sh` → timestamped `pg_dump` to a backups dir + prune older than 7 days. Run by host cron (documented), not in-app.
- **Logging:** pino level via `LOG_LEVEL` env (default by NODE_ENV); add a `genReqId` so every log line carries a request id.

## Artifacts (Buildable now)

### API
- `apps/api/package.json`: add `@vitest/coverage-v8` (dev) + `"test:coverage": "vitest run --coverage"`.
- `apps/api/vitest.config.ts` (from Phase 1): add `coverage` block (`provider: 'v8'`, `include: ['src/**/*.ts']`, `exclude` tests + `db/migrations`, reporters; thresholds present but commented with a how-to note).
- `apps/api/src/config/env.ts`: add `LOG_LEVEL` (optional string).
- `apps/api/src/app.ts`: use `env.LOG_LEVEL` for the logger level; add `genReqId` (uuid) to the Fastify factory.

### Deploy
- `docker-compose.prod.yml` (repo root): `api` + `web` services only, `restart: unless-stopped`, ports bound to `127.0.0.1`, env from `.env.prod`. No `db`, no `nginx`.
- `.env.prod.example` (repo root): `DATABASE_URL` (external PG), `JWT_SECRET`, `CORS_ORIGIN`, `VITE_API_BASE_URL`, `ENABLE_PRICE_SCHEDULER=true`, `LOG_LEVEL=info`.
- `scripts/build-release.sh`: produce `dist/finfolio-release.zip` containing `apps/`, `scripts/`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.prod.yml`, `.env.prod.example` (excludes `node_modules`, `.git`, `.docker`, existing `dist`).
- `scripts/migrate.sh`: load `.env.prod` and run `pnpm --filter @finfolio/api db:migrate`.
- README "Deploy (production)" section documenting the full VM flow.

### Web
- `apps/web/src/router.tsx`: wrap page components in `React.lazy`; provide a `<Suspense fallback={<RouteFallback/>}>` around the router outlet (or per-route). Keep `LoginPage`/`AppLayout` eager (shell), lazy the rest (esp. chart-heavy `DashboardPage`, `StockDetailPage`, `ReportsPage`, `CryptoPortfolioPage`).
- `apps/web/src/components/RouteFallback.tsx`: lightweight skeleton/spinner.
- `apps/web/src/index.css`: `:focus-visible` ring (brand), `@media (prefers-reduced-motion: reduce)` to disable transitions/animations, skip-link styles.
- `apps/web/src/components/layout/AppLayout.tsx`: add a skip-to-content `<a href="#main">`, `id="main"` on `<main>`, `aria-label`s on the icon/logout buttons.

### Docs
- `README.md`: add Deploy (production) + a short "Scripts" subsection.
- `CHANGELOG.md`: MVP v1.0 entry.
- `CLAUDE.md`: note `docker-compose.prod.yml` + the deploy model (Cloudflare Tunnel, external PG, no nginx).

## Boundaries / notes

- The router conversion to `lazy` must preserve the existing route tree and the `appRoute` `beforeLoad` auth guard. Only the `component` becomes lazy.
- `build-release.sh` and `backup.sh` are POSIX `sh`/`bash` scripts run on the Linux VM (not Windows-dev-critical); document running them in WSL/Git-Bash if needed locally.
- No behavior change to API endpoints; logging/reqId is additive.

## Testing

- **Pure/Unit:** none new of substance — this phase is config/ops. Verification is mechanical:
  - `pnpm --filter @finfolio/api test:coverage` runs and emits a coverage report (no threshold failure).
  - `pnpm --filter @finfolio/api typecheck` and `pnpm --filter @finfolio/web typecheck` stay clean after the router/lazy + logger changes.
  - `apps/web` builds: `pnpm --filter @finfolio/web build` succeeds and emits split chunks (chart libs not in the entry chunk).
  - `docker compose -f docker-compose.prod.yml config` validates (compose file is well-formed).
  - `sh -n scripts/*.sh` (syntax check) passes for the shell scripts.
- **Manual (needs a VM/host):** the full unzip→build→migrate→up flow and `backup.sh` restore are part of the verify-later launch gate.

## Acceptance criteria (buildable-now)

- [x] `test:coverage` runs and produces a report without failing on partial coverage.
- [ ] `docker-compose.prod.yml` validates, contains only `api` + `web` (no `db`/`nginx`), binds `127.0.0.1`, reads `.env.prod`.
- [ ] `scripts/build-release.sh` produces `finfolio-release.zip`; `scripts/migrate.sh` and `scripts/backup.sh` pass `sh -n`.
- [x] Web routes are lazy-loaded behind Suspense; `build` shows chart libs split out of the entry chunk; both typechecks clean.
- [x] a11y: visible focus ring, reduced-motion honored, skip-to-content present, icon buttons labelled.
- [x] README Deploy section + CHANGELOG v1.0 + CLAUDE.md prod note written.

## Out of scope (restated)

CI/git, nginx, bundled Postgres, and the feature-dependent verify-later gates (coverage 70%, E2E,
perf/load thresholds, OWASP audit, backup restore-test).
