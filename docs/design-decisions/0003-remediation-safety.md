# ADR 0003: Dual-control remediations

## Status

Accepted

## Context

Auto-remediation is the highest-risk feature in a cloud-ops product. Duplicate clicks, expired approvals, and accidental AWS writes are the failure modes that matter.

## Decision

Split plan / approve / execute. Default `dryRun: true`. Hash approval tokens, expire them, and consume them on execute. Unique idempotency keys on executions. Real AWS mutations stay behind `ENABLE_AWS_MUTATIONS`.

## Consequences

- Demo path is slightly more clicks (three calls) but maps to production change management.
- Operators cannot self-approve; an admin identity is required.
