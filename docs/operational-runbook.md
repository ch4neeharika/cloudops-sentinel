# Operational runbook

## Demo health

1. `curl http://localhost:3000/health/live` → `{ "status": "live" }`
2. `curl http://localhost:3000/health/ready` → Mongo `ok`. Diagnostics may be `degraded` without failing readiness so the API can still serve reads.
3. Worker: `curl http://localhost:9091/health/ready`
4. Diagnostics: `curl http://localhost:8000/health/ready`

## Job stuck in `running`

Cause: worker died before completing, lease still valid.

Action:

- Wait for `WORKER_LEASE_MS` (default 30s). Recovery flips the job to `retry_wait`.
- Confirm worker liveness on `:9091`.
- Inspect `lastError` on `GET /api/v1/jobs/:id`.

## Job in `dead_lettered`

Cause: `attempts >= maxAttempts` or non-retryable error.

Action:

- Read `lastError.code` (`TIMEOUT`, `PROCESSING_ERROR`, `VALIDATION`).
- Fix diagnostics availability or payload.
- `POST /api/v1/jobs/:id/retry` as operator/admin (resets attempts).

## Diagnostics circuit open

Symptoms: jobs fail with `DEPENDENCY_UNAVAILABLE`.

Action:

- Check diagnostics `/health/live`.
- Wait `CB_RESET_TIMEOUT_MS` for half-open probe.
- Confirm no flood of 5xx from policy engine.

## Remediation rejected

| Message | Meaning |
| --- | --- |
| Invalid approval token | Token hash mismatch |
| Approval token expired | `APPROVAL_TTL_MS` elapsed |
| Approval token already used | Replay of a consumed token |
| Action is not allowlisted | Policy recommended `manual_review` or unknown action |
| Real AWS mutations are disabled | `ENABLE_AWS_MUTATIONS` is false (expected default) |

## High API latency

Query Prometheus:

```
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))
```

Check Mongo connection and rate-limit headers (`RateLimit-*`).

## Failure-troubleshooting guide

1. Correlation ID from the error body → grep API and worker JSON logs.
2. Job id → `GET /jobs/:id` then findings by `jobId`.
3. Metrics: `job_retries_total`, `job_dead_letter_total`, `worker_queue_depth`.
4. Audit: `GET /api/v1/audit-events?action=remediation.execute`.
