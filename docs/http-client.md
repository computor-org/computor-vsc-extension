# HTTP Clients

## Base client
`src/http/HttpClient.ts` wraps `node-fetch` with configurable timeout, retry (exponential back-off), optional in-memory caching, and request/response interceptors. It raises typed errors (`HttpError`, `NetworkError`, `TimeoutError`, `ValidationError`).

## Concrete clients
- **BasicAuthHttpClient** – Adds `Authorization: Basic` header and validates credentials via `/user`.
- **ApiKeyHttpClient** – Injects tokens into a configurable header (default `X-API-Key`). Helpers exist for GitLab PATs.
- **JwtHttpClient** – Sends `Authorization: Bearer` headers and supports refresh tokens. The interactive OAuth flow still needs implementation.

## Service usage
`ComputorApiService` receives one of the clients from the login flow and layers on:
- `ErrorRecoveryService` for retry with user-facing diagnostics.
- `RequestBatchingService` to coalesce repeated lookups (course contents, content types).
- `CacheService` (`multiTierCache`) to store rarely changing data.
- `PerformanceMonitoringService` to log API timings.

Responses feed the tree providers, repository managers, and command handlers that power each role.
