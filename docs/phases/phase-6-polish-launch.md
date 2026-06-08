# Phase 6 — Polish & Launch

> Testing, performance, accessibility, security, deployment, docs. Ship MVP v1.0.

## Goal

Everything from phases 1–5 hardened to the SRS non-functional bar and deployed single-host
via Docker Compose + Cloudflare Tunnel, with docs complete.

## Delivers (SRS)

NFR 4.1 (perf) · 4.2 (security) · 4.3 (reliability) · 4.4 (maintainability) · 4.5 (usability/a11y) · §9.1 launch scope.

## Tasks

### Quality
- [ ] Unit coverage ≥ 70% overall, with calc modules near 100% (NFR 4.4).
- [ ] Integration tests for each module's CRUD + auth guard.
- [ ] E2E happy paths (register → add gold/stock/crypto → dashboard → report → CSV).
- [ ] Empty / loading / error / stale / offline states audited on every screen (DESIGN.md §10).

### Performance (NFR 4.1)
- [ ] API P95 < 300ms (excl. external calls); add indexes, verify query plans (P99 < 100ms).
- [ ] Web FCP < 2s on 3G; bundle ≤ 250KB gzipped (code-split routes, lazy charts).
- [ ] Dashboard render < 1s on cached data; price caching effective.
- [ ] Load test ≥ 50 concurrent users (pool 20).

### Security (NFR 4.2)
- [ ] OWASP Top 10 pass; dependency audit.
- [ ] Verify JWT cookie flags (httpOnly/Secure/SameSite), bcrypt cost ≥12, rate limits (100/min, auth 5/min).
- [ ] Zod validation on every endpoint; no raw SQL (Drizzle only).
- [ ] Secrets via env; no hardcoded keys; external API keys server-side only.
- [ ] HTTPS + ingress via **Cloudflare Tunnel** (TLS terminated at Cloudflare; no nginx/public ports). Verify only the tunnel exposes the app; containers bind localhost.

### Reliability (NFR 4.3)
- [ ] PostgreSQL daily dump, ≥7-day retention.
- [ ] External-API fallbacks verified (CoinGecko→CMC, FX→Vietcombank, prices→cache).
- [ ] Graceful degradation: stale price + timestamp when live fetch fails.
- [ ] Uptime/health monitoring; structured logs shipped.

### Accessibility & UX (NFR 4.5)
- [ ] WCAG 2.1 AA: contrast, keyboard nav, focus rings, ARIA labels, chart text-summary fallback.
- [ ] Status never color-only (sign + arrow + label).
- [ ] `prefers-reduced-motion` respected; touch targets ≥44px.
- [ ] i18n keys ready for EN (default vi-VN).

### Deploy & docs
Production runs on a Docker VM that already has **PostgreSQL** and a **Cloudflare Tunnel**
(ingress + TLS). So: **no nginx** service, and **no bundled Postgres** — the API connects to the
existing PG via `DATABASE_URL`.

- [x] `docker-compose.prod.yml`: builds + runs **api + web only** (no `db`, no `nginx`); api reads `DATABASE_URL` pointing at the server's existing PostgreSQL; Cloudflare Tunnel routes to the web/api ports.
- [x] Production `.env` (prod): `DATABASE_URL` = existing PG, `JWT_SECRET`, `CORS_ORIGIN` = the tunnel hostname, `VITE_API_BASE_URL` = the tunnel API URL, `ENABLE_PRICE_SCHEDULER=true`.
- [x] **Build artifact (zip):** a `scripts/build-release.sh` that produces a `finfolio-release.zip` containing the source needed to build, `docker-compose.prod.yml`, and `.env.example` — to copy onto the prod VM.
- [x] **Release flow on the VM:** unzip → `docker compose --env-file .env.prod -f docker-compose.prod.yml build` → run DB migrations against the existing PG (`pnpm --filter @finfolio/api db:migrate` or a one-shot migrate container) → `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`.
- [ ] Confirm the Cloudflare Tunnel maps the public hostname → the web (and `/v1` → api) container ports; no nginx/TLS config needed in-repo.
- [ ] Swagger UI complete + accurate; README run/deploy steps verified (incl. the zip + migrate + compose-up flow).
- [x] Release notes / changelog for MVP v1.0.

## Acceptance criteria (launch gate)

- [ ] All NFR thresholds met and measured (not assumed).
- [ ] CI green; coverage gate ≥70%.
- [ ] On the prod VM: unzip release → build → migrate against existing PG → `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d` → app reachable via the Cloudflare Tunnel hostname (HTTPS terminated by Cloudflare, no nginx).
- [ ] Security review signed off; backups verified by a test restore.
