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
