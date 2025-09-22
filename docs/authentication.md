# Authentication

## Supported methods
1. **Basic auth** – Username/password stored per role in VS Code secret storage. `BasicAuthHttpClient` sets the `Authorization: Basic` header and validates credentials with a `/user` probe.
2. **API key** – Users paste a token (e.g., GitLab PAT). `ApiKeyHttpClient` injects it into the configured header (`X-API-Key` by default). Header name/prefix are stored in `~/.computor/config.json`.
3. **JWT token** – Users paste an existing OAuth token. `JwtHttpClient` sends `Authorization: Bearer <token>` and refreshes automatically if a refresh token + expiry are provided. The interactive Keycloak login flow is not implemented yet.

The selected credentials are saved in `context.secrets` under `computor.<Role>.auth`. Each role can retain its own auth payload.

## Login flow
- `loginFlow` loads or asks for the backend URL, prompts for the auth method, and collects credentials.
- If no workspace folder is open, the user is prompted to choose one before the login continues.
- After successful activation, the role controller stores the auth payload for reuse and sets `computor.isLoggedIn`.

## Marker files
- `.computor` stores the active course ID for the workspace. All roles share the same course selection.

## Managing secrets
- Run `Computor: Manage Git Tokens` to add/update/remove GitLab PATs per origin.
- Run `Computor: Logout` to dispose the active role; stored secrets remain so the next login can reuse them.
