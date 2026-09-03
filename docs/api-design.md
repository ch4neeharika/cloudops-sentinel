# API design

## Conventions

- Prefix: `/api/v1`
- Auth: `Authorization: Bearer <jwt>`
- Correlation: `x-correlation-id` (generated if absent, always returned)
- Pagination: `page`, `limit` (max 100)
- Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "correlationId": "..."
  }
}
```

Internal 5xx messages are generic. Validation and auth failures include a stable `code`.

## Role matrix

| Endpoint family | Viewer | Operator | Admin |
| --- | --- | --- | --- |
| GET resources/jobs/findings/recommendations | yes | yes | yes |
| POST sync / diagnostics / retry / plan / execute | no | yes | yes |
| POST approve | no | no | yes |
| GET audit-events | no | yes | yes |

## Idempotency

`POST /diagnostics`, `POST /remediations/plan`, and `POST /remediations/:id/execute` require `idempotencyKey` (8–128 chars). Replays return the original record with `replayed: true`.

## OpenAPI

The source of truth is `docs/openapi.yaml`, served at `/docs` and `/docs.json`.
