# FinFolio — Personal Capital Management (MVP scaffold)

Monorepo for the FinFolio MVP. **This is a scaffold**: folder structure, library
setup, working authentication, and the full database schema. Feature modules
(gold / stock / crypto / dashboard / reports) are stubbed — see the SRS in
[docs/SRS.md](docs/SRS.md) for what each will contain.

## Stack

| Layer    | Tech                                                                 |
|----------|----------------------------------------------------------------------|
| Backend  | Node.js · Fastify 5 · Drizzle ORM · PostgreSQL · @fastify/jwt · Zod  |
| Frontend | React 18 · Vite · TanStack Router + Query · Tailwind · Zustand · Zod |
| Tooling  | pnpm workspaces · TypeScript · Docker Compose                        |

## Layout

```
.
├─ apps/
│  ├─ api/                 # Fastify REST API
│  │  ├─ drizzle/          # SQL migrations (0000_init.sql) + meta
│  │  └─ src/
│  │     ├─ config/        # env validation (zod)
│  │     ├─ db/schema/     # Drizzle tables (all SRS §6 tables)
│  │     ├─ plugins/       # auth (JWT), swagger
│  │     ├─ modules/       # auth (implemented) + feature stubs
│  │     ├─ app.ts         # Fastify builder (plugins, errors, routes)
│  │     ├─ routes.ts      # mounts every module under /v1
│  │     └─ server.ts      # entrypoint
│  └─ web/                 # React SPA
│     └─ src/
│        ├─ components/    # layout + shared
│        ├─ features/auth/ # login page + auth API
│        ├─ lib/           # axios client (+ refresh), cn util
│        ├─ stores/        # zustand auth store
│        ├─ router.tsx     # TanStack route tree (guarded)
│        └─ main.tsx
├─ docker-compose.yml      # db + api + web
├─ docs/SRS.md             # source spec
└─ pnpm-workspace.yaml
```

## Getting started (local dev)

Prerequisites: Node 20+, pnpm 9+, a running PostgreSQL (or `docker compose up db`).

```bash
pnpm install

# --- API ---
cp .env.example apps/api/.env        # then edit JWT_SECRET / DATABASE_URL
pnpm --filter @finfolio/api db:migrate   # apply drizzle/0000_init.sql
pnpm --filter @finfolio/api dev          # http://localhost:3000  (docs: /docs)

# --- Web ---
cp apps/web/.env.example apps/web/.env
pnpm --filter @finfolio/web dev          # http://localhost:5173
```

Or run everything at once: `pnpm dev` (parallel).

## Database

Schema lives in `apps/api/src/db/schema/` and is the source of truth.

```bash
pnpm --filter @finfolio/api db:generate   # regenerate migrations after schema edits
pnpm --filter @finfolio/api db:migrate     # apply migrations
pnpm --filter @finfolio/api db:push        # push schema directly (dev shortcut)
pnpm --filter @finfolio/api db:studio      # Drizzle Studio
```

A hand-authored `drizzle/0000_init.sql` is included so `db:migrate` works
out of the box.

## Auth (implemented)

| Method | Endpoint         | Notes                                              |
|--------|------------------|----------------------------------------------------|
| POST   | `/v1/auth/register` | bcrypt (cost 12), returns access token + sets refresh cookie |
| POST   | `/v1/auth/login`    | rate-limited 5/min                              |
| POST   | `/v1/auth/refresh`  | rotates refresh token (httpOnly cookie)         |
| POST   | `/v1/auth/logout`   | revokes refresh token                           |
| GET    | `/v1/auth/me`       | JWT-guarded                                     |

Access token: 15 min JWT. Refresh token: 30-day opaque token, stored hashed
server-side, delivered as an `httpOnly` cookie.

## Docker

```bash
cp .env.example .env   # set JWT_SECRET
docker compose up --build
# web → http://localhost:8080 · api → http://localhost:3000
```

## Deploy (production)

Production runs on a Docker VM that already has **PostgreSQL** and a **Cloudflare Tunnel**
(ingress + TLS). The app ships as a zip; there is **no nginx** and **no bundled Postgres**.

```bash
# 1. On a dev machine: build the release zip
sh scripts/build-release.sh            # -> dist/finfolio-release.zip

# 2. Copy dist/finfolio-release.zip to the VM, then on the VM:
unzip finfolio-release.zip -d finfolio && cd finfolio
cp .env.prod.example .env.prod         # edit: DATABASE_URL (existing PG), JWT_SECRET, hostnames

# 3. Build, migrate the existing DB, start
docker compose --env-file .env.prod -f docker-compose.prod.yml build
sh scripts/migrate.sh                  # runs drizzle migrations against DATABASE_URL
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

The Cloudflare Tunnel maps the public hostname to `web` (`127.0.0.1:8080`) and `/v1/*` to `api`
(`127.0.0.1:3000`). TLS is terminated at Cloudflare; containers bind localhost only.

## Scripts

- `scripts/build-release.sh` — package a deployable `dist/finfolio-release.zip`.
- `scripts/migrate.sh` — apply DB migrations using `.env.prod`.
- `scripts/backup.sh` — `pg_dump` the external PG (7-day retention); wire to host cron.

## Next (per SRS roadmap)

Implement the stubbed modules: Gold (Sprint 2), Stock (Sprint 3),
Crypto (Sprint 4), Dashboard + Reports (Sprint 5).
