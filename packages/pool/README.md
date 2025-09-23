# Pool Datastore Service

This package implements the Golden Workplace "pool" data plane. It exposes APIs consumed by the Clover concierge and document ingestion flows while keeping captured data isolated from company-owned datasets.

## Features

- Postgres schema managed with Drizzle migrations (`pool_messages` and `pool_files` tables)
- Multi-tenant data separation via `account_id` and `user_id` columns
- Deterministic embeddings to support similarity search without external providers
- Express server with the following routes:
    - `POST /pool/messages`
    - `POST /pool/files`
    - `GET /pool/items`
    - `POST /pool/search`
- Vitest coverage for the router contract (see `src/__tests__/poolRoutes.spec.ts`)

## Local development

1. Provision a Postgres instance dedicated to the pool store. Update `.env` with `POOL_DATABASE_URL`.
2. Generate or migrate schema as needed:

    ```bash
    pnpm --filter @roo-code/pool db:generate
    pnpm --filter @roo-code/pool db:migrate
    ```

3. Launch the API:

    ```bash
    pnpm --filter @roo-code/pool tsx src/http/server.ts
    ```

## Testing

Run the router contract tests:

```bash
pnpm --filter @roo-code/pool test
```

The tests exercise the HTTP surfaces with an in-memory repository stub, keeping the suite lightweight while ensuring request validation and multi-tenant enforcement behave as expected.
