#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
docker compose up --build -d
echo "Waiting for API..."
for _ in $(seq 1 60); do
  if curl -sf http://localhost:3000/health/live >/dev/null; then
    break
  fi
  sleep 2
done
docker compose exec -T api node dist/seed.js
echo
echo "Swagger:     http://localhost:3000/docs"
echo "Prometheus:  http://localhost:9090"
echo "Grafana:     http://localhost:3001 (admin/admin)"
echo "Diagnostics: http://localhost:8000/docs"
