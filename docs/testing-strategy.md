# Testing strategy

Tests target behavior that would page an on-call engineer if it broke.

## Unit

- Zod schemas reject short idempotency keys
- Password hash/verify and JWT round-trip
- Exponential backoff caps
- Circuit breaker opens after threshold
- Allowlist enforcement and simulated tag/alarm/backup actions
- All nine diagnostics policy rules (Pytest)
- Mock inventory contains a fixture for every rule family

## Integration (Supertest + mongodb-memory-server)

- Login success/failure
- Viewer cannot create jobs
- Workspace isolation of inventory
- Diagnostic job idempotent replay
- Remediation plan → admin approve → operator execute
- Invalid and expired approval tokens
- Correlation ID on validation errors
- Health and Prometheus exposition

## Worker

- Happy path persists findings/recommendations and completes
- Timeout path writes `retry_wait` with `TIMEOUT`
- Queue tests cover atomic claim, DLQ, abandoned lease recovery, non-retryable fail

## Load

- `load-tests/k6-health.js` checks live endpoint p95/p99
- Artillery YAML provided as an alternative

## What we do not fake

Diagnostics tests assert rule IDs and recommendation action types. Worker tests stub only the HTTP diagnostics client, not the queue or Mongo writes.
