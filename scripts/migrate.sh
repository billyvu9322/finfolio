#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env.prod ] && . ./.env.prod; set +a
pnpm --filter @finfolio/api db:migrate
echo "Migrations applied"
