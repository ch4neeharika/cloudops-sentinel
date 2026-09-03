# Threat model

Scope: local/demo deployment of CloudOps Sentinel. Assets are JWTs, approval tokens, workspace data, and (optional) AWS read credentials.

## Authentication

- Passwords are bcrypt-hashed. JWT secret comes from the environment, never from source.
- Invalid logins return a generic 401.
- Tokens expire (`JWT_EXPIRES_IN`).

## Authorization

- RBAC is enforced in middleware. Viewers cannot enqueue jobs or plan remediations. Only admins issue approval tokens.
- Missing/invalid Bearer tokens are 401.

## Tenant isolation

- `workspaceId` is taken from the JWT, never from the client body.
- Reads use `{ _id, workspaceId }`. Cross-tenant IDs look like missing documents (404).

## Credential exposure

- Pino redacts `authorization`, `password`, `passwordHash`, `token`, and AWS secret keys.
- AWS credentials are not accepted as request fields; the SDK default chain is used.
- `.env` is gitignored. `.env.example` contains demo placeholders only.

## Replay attacks and duplicate execution

- Diagnostic jobs, plans, and executions are uniquely indexed on `(workspaceId, idempotencyKey)`.
- Approval tokens are SHA-256 hashed, single-use, and TTL-bound.
- Execute rejects used or expired tokens.

## Injection

- Zod validates all write payloads and list query params.
- Resource name search regex-escapes user input.
- Mongo queries are parameterized object filters, not string-concatenated.

## Unsafe remediation

- Dry-run default.
- Allowlist of five simulated actions.
- Real AWS writes require an explicit env flag that stays false in Compose and Kubernetes templates.
- Before/after snapshots and immutable audit events record privileged actions.

## Rate abuse

- `express-rate-limit` plus Helmet headers on the API process.
