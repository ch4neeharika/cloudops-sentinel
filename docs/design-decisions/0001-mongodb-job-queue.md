# ADR 0001: MongoDB as the durable job queue

## Status

Accepted

## Context

The worker must claim jobs without double-processing, survive crashes, and remain demoable with Docker Compose. SQS/Kafka would add AWS or JVM-adjacent dependencies.

## Decision

Store `DiagnosticJob` documents in MongoDB. Claim with `findOneAndUpdate` on `pending|retry_wait` where `nextRunAt <= now` and the lease is absent or expired. Persist lease owner, heartbeat, attempts, and structured errors on the same document.

## Consequences

- Exactly-once *claim* is not guaranteed under extreme clock skew, but lease expiry plus idempotent finding upserts make processing safe.
- Local demo stays one compose file.
- A later outbox-to-SQS adapter can be added without changing the API contract.
