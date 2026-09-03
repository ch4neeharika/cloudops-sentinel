.PHONY: help install up down logs seed test lint typecheck format diagnostics-test demo

help:
	@echo "CloudOps Sentinel targets:"
	@echo "  make install           Install Node workspaces and Python deps"
	@echo "  make up                Build and start docker compose stack"
	@echo "  make down              Stop stack and remove volumes"
	@echo "  make logs              Tail compose logs"
	@echo "  make seed              Seed demo workspace, users, and resources"
	@echo "  make test              Run Jest + Pytest"
	@echo "  make lint              ESLint + Prettier check + ruff/pycodestyle if present"
	@echo "  make typecheck         TypeScript project references"
	@echo "  make demo              Print local demo URLs"

install:
	npm install
	python3 -m pip install -r services/diagnostics/requirements.txt -r services/diagnostics/requirements-dev.txt

up:
	docker compose up --build -d
	@echo "Waiting for API readiness..."
	@until curl -sf http://localhost:3000/health/live >/dev/null; do sleep 2; done
	@echo "API is live at http://localhost:3000/docs"

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=100

seed:
	docker compose exec api node dist/seed.js

test:
	npm test
	cd services/diagnostics && python3 -m pytest -q

lint:
	npm run lint
	npm run format:check

typecheck:
	npm run typecheck

format:
	npm run format

diagnostics-test:
	cd services/diagnostics && python3 -m pytest -q

demo:
	@echo "Swagger:     http://localhost:3000/docs"
	@echo "Metrics:     http://localhost:3000/metrics"
	@echo "Prometheus:  http://localhost:9090"
	@echo "Grafana:     http://localhost:3001 (admin/admin)"
	@echo "Diagnostics: http://localhost:8000/docs"
