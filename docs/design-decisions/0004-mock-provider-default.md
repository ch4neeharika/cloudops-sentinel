# ADR 0004: Mock provider is the default cloud integration

## Status

Accepted

## Context

The project must run without AWS credentials. A skeleton that "throws unless AWS is configured" fails the demo requirement.

## Decision

`CLOUD_PROVIDER=mock` by default. `MockAwsProvider` returns a deterministic inventory designed to trip every policy rule. `AwsProvider` is a real read-only SDK client selected only when configured.

## Consequences

- Reviewers can exercise the entire product locally.
- Real AWS coverage is inventory-only and first-page bounded; it is not an account-wide CMDB.
