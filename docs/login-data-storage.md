# Storage & Persistence

## Config file
- Path: `~/.computor/config.json` (managed by `ComputorSettingsManager`).
- Contents: backend URL, preferred auth provider, token header metadata, optional workspace repository directory, lecturer/student tree expansion state, cached GitLab token map.
- The manager exposes getters/setters and handles file creation on first run.

## Secret storage
- VS Code `ExtensionContext.secrets` stores per-role authentication payloads (`computor.<Role>.auth`) and GitLab tokens (`gitlab-token-<origin>`).
- Secrets persist across sessions; logout does not remove them.

## Workspace markers
- `.computor` – `{ "courseId": "…" }` for the active course shared across all roles.

## Global state
- `pendingLogin` – lets the login flow resume after the user opens a folder.
- `selectedCourseId` / `selectedCourseInfo` – cached student course selection for `CourseSelectionService`.
- `computor.tutor.selection` – stores tutor course/group/member choice.

## Repository layout
- Student repositories live in the first workspace folder (fallback `~/.computor/workspace`).
- Lecturer repositories default to `<workspace>/<course-slug>-assignments`.
- Absolute paths saved on course content entries let tree providers expose filesystem nodes directly.
