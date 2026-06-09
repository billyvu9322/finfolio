# Phase 6 — Polish & Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **NO GIT this build.** Where a normal plan would `git commit`, use the **Checkpoint** step (verify command). Never run git.
>
> **Nature:** ops / config / docs (not feature TDD). Each task's "test" is a mechanical verify command.
>
> **Soft prerequisites:** the coverage task extends Phase 1's `vitest.config.ts` (add vitest first if not present). The web lazy-router task assumes the feature pages from Phases 1–5 exist; if run earlier, lazy-wrap whatever page components are present.

**Goal:** Ship-readiness for MVP v1.0 — coverage tooling, production deploy artifacts (Cloudflare Tunnel + external PostgreSQL + release zip, no nginx/no bundled PG), web code-splitting + a11y foundations, backup/logging ops, and launch docs. Feature-dependent gates (coverage ≥70%, E2E, perf/load, OWASP, restore-test) stay as a verify-later checklist in the phase doc.

**Tech Stack:** vitest + @vitest/coverage-v8 (API), Docker Compose, POSIX shell, React.lazy/Suspense + Vite (Web).

**Spec:** [../specs/2026-06-08-phase6-polish-launch-design.md](../specs/2026-06-08-phase6-polish-launch-design.md)

---

## Task 1: API — coverage tooling + logging

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/vitest.config.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`

- [x] **Step 1: Add coverage dep + script**

In `apps/api/package.json`: add `"@vitest/coverage-v8": "^2.1.4"` to `devDependencies`; add `"test:coverage": "vitest run --coverage"` to `scripts`. Run `pnpm install`.

- [x] **Step 2: Configure coverage (soft thresholds)**

In `apps/api/vitest.config.ts`, extend the `test` block:
```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/db/schema/**'],
      // Enable the repo-wide gate once Phases 1–5 are implemented:
      // thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
```

- [x] **Step 3: `LOG_LEVEL` env**

In `apps/api/src/config/env.ts`, add to the schema:
```ts
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
```

- [x] **Step 4: Logger level + request id**

In `apps/api/src/app.ts`, replace the `Fastify({...})` logger config:
```ts
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();
```
Add at the top of `app.ts`: `import { randomUUID } from 'node:crypto';`

- [x] **Step 5: Checkpoint**

Run: `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test:coverage`
Expected: typecheck clean; tests run; a coverage table prints; **no threshold failure** (thresholds commented).

---

## Task 2: Deploy artifacts

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.prod.example`
- Create: `scripts/build-release.sh`
- Create: `scripts/migrate.sh`
- Create: `scripts/backup.sh`

- [x] **Step 1: Production compose (api + web only)**

Create `docker-compose.prod.yml`:
```yaml
# Production stack for a VM that already has PostgreSQL + a Cloudflare Tunnel.
# No `db` (external PG via DATABASE_URL), no `nginx` (tunnel terminates TLS).
services:
  api:
    build:
      context: ./apps/api
    restart: unless-stopped
    env_file: .env.prod
    environment:
      NODE_ENV: production
      API_PORT: 6001
    ports:
      - "127.0.0.1:6001:6001"

  web:
    build:
      context: ./apps/web
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL}
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - "127.0.0.1:8080:80"
```

- [x] **Step 2: Production env example**

Create `.env.prod.example`:
```bash
NODE_ENV=production
# Existing PostgreSQL on the server (NOT a container)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/finfolio
JWT_SECRET=replace-with-a-32+char-random-secret
# Public hostnames served by the Cloudflare Tunnel
VITE_API_BASE_URL=https://app.finfolio.example/v1
ENABLE_PRICE_SCHEDULER=true
LOG_LEVEL=info
```

- [x] **Step 3: Release zip builder**

Create `scripts/build-release.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="dist/finfolio-release.zip"
mkdir -p dist
rm -f "$OUT"
zip -r "$OUT" \
  apps scripts package.json pnpm-workspace.yaml tsconfig.base.json \
  docker-compose.prod.yml .env.prod.example \
  -x '*/node_modules/*' '*/dist/*' '*/.docker/*' '*/.git/*' '*.log'
echo "Built $OUT"
```

- [x] **Step 4: Migrate helper**

Create `scripts/migrate.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env.prod ] && . ./.env.prod; set +a
pnpm --filter @finfolio/api db:migrate
echo "Migrations applied"
```

- [x] **Step 5: Backup script**

Create `scripts/backup.sh`:
```bash
#!/usr/bin/env bash
# Daily pg_dump of the external PostgreSQL, with 7-day retention.
# Run from host cron, e.g.:  0 2 * * * /opt/finfolio/scripts/backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env.prod ] && . ./.env.prod; set +a
BACKUP_DIR="${BACKUP_DIR:-./.backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/finfolio-$STAMP.sql.gz"
find "$BACKUP_DIR" -name 'finfolio-*.sql.gz' -mtime +7 -delete
echo "Backup written to $BACKUP_DIR/finfolio-$STAMP.sql.gz"
```

- [ ] **Step 6: Checkpoint**

Run (Linux/WSL/Git-Bash):
```
docker compose -f docker-compose.prod.yml config >/dev/null && echo COMPOSE_OK
sh -n scripts/build-release.sh && sh -n scripts/migrate.sh && sh -n scripts/backup.sh && echo SH_OK
```
Expected: `COMPOSE_OK` and `SH_OK`. (On Windows-only dev, run these in WSL/Git-Bash; otherwise verify the files exist and are syntactically obvious.)

---

## Task 3: Web — lazy routes + Suspense

**Files:**
- Create: `apps/web/src/components/RouteFallback.tsx`
- Modify: `apps/web/src/router.tsx`

> Assumes Phases 1–5 web pages exist. Keep the shell (`AppLayout`, `LoginPage`) eager; lazy-load the rest (esp. chart-heavy pages) so `recharts`/`lightweight-charts` land in their own chunks.

- [x] **Step 1: Route fallback**

Create `apps/web/src/components/RouteFallback.tsx`:
```tsx
export function RouteFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-neutral-500">
      <span className="animate-pulse">Đang tải…</span>
    </div>
  );
}
```

- [x] **Step 2: Convert the router to lazy components**

Replace `apps/web/src/router.tsx` with (shell eager, feature pages lazy):
```tsx
import { Suspense, lazy, type ComponentType } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';

import { AppLayout } from '@/components/layout/AppLayout';
import { RouteFallback } from '@/components/RouteFallback';
import { LoginPage } from '@/features/auth/LoginPage';
import { useAuthStore } from '@/stores/auth';

// Lazy a named export as a route component.
function lazyPage<M extends Record<string, ComponentType<unknown>>>(
  loader: () => Promise<M>,
  name: keyof M,
) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] })));
  return () => (
    <Suspense fallback={<RouteFallback />}>
      <C />
    </Suspense>
  );
}

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: lazyPage(() => import('@/features/auth/RegisterPage'), 'RegisterPage'),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});

const child = (path: string, component: ComponentType) =>
  createRoute({ getParentRoute: () => appRoute, path, component });

const dashboardRoute = child('/dashboard', lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'));
const goldRoute = child('/gold', lazyPage(() => import('@/features/gold/GoldPortfolioPage'), 'GoldPortfolioPage'));
const goldAddRoute = child('/gold/add', lazyPage(() => import('@/features/gold/GoldAddPage'), 'GoldAddPage'));
const stocksRoute = child('/stocks', lazyPage(() => import('@/features/stock/StockPortfolioPage'), 'StockPortfolioPage'));
const stocksAddRoute = child('/stocks/add', lazyPage(() => import('@/features/stock/StockAddPage'), 'StockAddPage'));
const stockDetailRoute = child('/stocks/$symbol', lazyPage(() => import('@/features/stock/StockDetailPage'), 'StockDetailPage'));
const cryptoRoute = child('/crypto', lazyPage(() => import('@/features/crypto/CryptoPortfolioPage'), 'CryptoPortfolioPage'));
const cryptoAddRoute = child('/crypto/add', lazyPage(() => import('@/features/crypto/CryptoAddPage'), 'CryptoAddPage'));
const reportsRoute = child('/reports', lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage'));
const settingsRoute = child('/settings', lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage'));

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    goldRoute,
    goldAddRoute,
    stocksRoute,
    stocksAddRoute,
    stockDetailRoute,
    cryptoRoute,
    cryptoAddRoute,
    reportsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

> Keep `stocksAddRoute` (`/stocks/add`) listed before `stockDetailRoute` (`/stocks/$symbol`) so the literal path wins.

- [x] **Step 3: Checkpoint**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean. (Any page import path that differs from Phases 1–5 must be corrected to match the actual file.)

---

## Task 4: Web — a11y foundations

**Files:**
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`

- [x] **Step 1: Global focus-visible, reduced-motion, skip-link**

Append to `apps/web/src/index.css`:
```css
/* Visible keyboard focus (WCAG 2.4.7) */
:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

/* Respect reduced-motion (WCAG 2.3.3 / motion sensitivity) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Skip-to-content link */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  background: #10b981;
  color: #0a0a0a;
  padding: 8px 12px;
  border-radius: 0 0 8px 0;
}
.skip-link:focus {
  left: 0;
}
```

- [x] **Step 2: Skip-link + main id + aria labels in AppLayout**

In `apps/web/src/components/layout/AppLayout.tsx`:
- As the first element inside the returned root container, add:
```tsx
        <a href="#main" className="skip-link">
          Bỏ qua tới nội dung
        </a>
```
- Add `id="main"` to the `<main>` element.
- Add `aria-label`s to icon-only controls (e.g. the logout button: `aria-label="Đăng xuất"`; any search/notification icon buttons get descriptive labels).

- [x] **Step 3: Checkpoint**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 5: Docs

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: README — Deploy (production) + Scripts**

Add to `README.md` (after the existing Docker section):
```markdown
## Deploy (production)

Production runs on a Docker VM that already has **PostgreSQL** and a **Cloudflare Tunnel**
(ingress + TLS). The app ships as a zip; there is **no nginx** and **no bundled Postgres**.

```bash
# 1. On a dev machine: build the release zip
sh scripts/build-release.sh            # → dist/finfolio-release.zip

# 2. Copy dist/finfolio-release.zip to the VM, then on the VM:
unzip finfolio-release.zip -d finfolio && cd finfolio
cp .env.prod.example .env.prod         # edit: DATABASE_URL (existing PG), JWT_SECRET, hostnames

# 3. Build, migrate the existing DB, start
docker compose --env-file .env.prod -f docker-compose.prod.yml build
sh scripts/migrate.sh                  # runs drizzle migrations against DATABASE_URL
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

The Cloudflare Tunnel maps the public hostname → `web` (`127.0.0.1:8080`) and `/v1/*` → `api`
(`127.0.0.1:3000`). TLS is terminated at Cloudflare; containers bind localhost only.

## Scripts

- `scripts/build-release.sh` — package a deployable `dist/finfolio-release.zip`.
- `scripts/migrate.sh` — apply DB migrations using `.env.prod`.
- `scripts/backup.sh` — `pg_dump` the external PG (7-day retention); wire to host cron.
```

- [x] **Step 2: CHANGELOG**

Create `CHANGELOG.md`:
```markdown
# Changelog

## v1.0.0 — MVP (unreleased)

Personal capital management for gold, Vietnamese stocks, and crypto.

- **Auth:** register/login/logout, JWT access + rotating refresh, profile update.
- **Gold:** transactions, DCA (FIFO), unrealized P&L, cached price support.
- **Stock:** transactions + dividends, WAVG, fee/tax, live (delayed) prices, candlestick detail.
- **Crypto:** transactions + swap, per-(coin, wallet) WAVG, USD/VND, 24h change.
- **Dashboard & Reports:** cross-asset AUM/P&L, allocation, growth from daily snapshots, P&L report, CSV export.
- **Ops:** Docker Compose (dev) + production compose (Cloudflare Tunnel, external PostgreSQL), release zip, backup script, Swagger UI.
```

- [x] **Step 3: CLAUDE.md prod note**

In `CLAUDE.md`, under the Commands/Docker area, add a line:
```markdown
- **Production:** `docker-compose.prod.yml` runs api + web only (no `db`, no `nginx`); a Cloudflare Tunnel fronts it and PostgreSQL is external (`DATABASE_URL`). Deploy via `scripts/build-release.sh` → unzip on VM → `scripts/migrate.sh` → `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`.
```

- [x] **Step 4: Checkpoint**

Verify the three docs exist and render (no code check needed).

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test:coverage`
  Expected: clean; coverage report prints; no threshold failure.
- [x] **Web:** `pnpm --filter @finfolio/web typecheck && pnpm --filter @finfolio/web build`
  Expected: clean; build emits multiple JS chunks; `recharts`/`lightweight-charts` are in lazy page chunks, not the entry chunk (inspect `dist/assets` filenames/sizes).
- [ ] **Deploy files:** `docker compose -f docker-compose.prod.yml config` validates; `sh -n scripts/*.sh` passes.
- [x] **Docs:** README Deploy + Scripts, CHANGELOG v1.0, CLAUDE.md prod note present.

---

## Acceptance criteria (buildable-now, from spec)

- [x] `test:coverage` runs and reports without failing on partial coverage. (Task 1)
- [ ] `docker-compose.prod.yml` = api + web only, binds 127.0.0.1, reads `.env.prod`, validates. (Task 2)
- [ ] `build-release.sh` zips a release; `migrate.sh`/`backup.sh` pass `sh -n`. (Task 2)
- [x] Routes lazy behind Suspense; chart libs split out of the entry chunk; typechecks clean. (Task 3)
- [x] Focus ring, reduced-motion, skip-to-content, aria-labels present. (Task 4)
- [x] README Deploy/Scripts + CHANGELOG v1.0 + CLAUDE.md prod note written. (Task 5)

## Verify-later launch gate (NOT built here — needs Phases 1–5 running)

- [ ] Coverage ≥70% repo-wide (flip on the commented thresholds).
- [ ] E2E happy-path; API P95 <300ms; FCP <2s; bundle ≤250KB gzipped; load test ≥50 users.
- [ ] OWASP Top 10 pass; dependency audit; backup restore-test.
- [ ] CI pipeline (add when git is enabled).
```
