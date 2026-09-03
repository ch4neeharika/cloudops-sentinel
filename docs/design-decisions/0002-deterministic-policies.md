# ADR 0002: Deterministic operational policies, not ML

## Status

Accepted

## Context

Findings must be explainable in a design review and stable in tests. A classifier would require training data and would hide why a recommendation was produced.

## Decision

The Python service is a rule engine. Each rule documents its threshold, evidence, and estimated impact. The response `engine` field is `deterministic-operational-policies`.

## Consequences

- Pytest can lock rule IDs and actions.
- Rules will miss novel failure modes; that is an accepted limitation and a future enhancement (policy packs), not a hidden model.
