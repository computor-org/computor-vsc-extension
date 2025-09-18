# Git Integration

## Token handling
- `GitLabTokenManager` stores personal access tokens per GitLab origin in VS Code secret storage (`gitlab-token-<origin>`).
- Tokens are requested automatically when cloning fails due to authentication and can be managed manually via `Computor: Manage Git Tokens`.

## Repository managers
- **Students** – `StudentRepositoryManager` clones submission repositories into the workspace root (using the repo slug as folder name), runs `git pull --ff-only` on existing clones, and, when course metadata exposes a template repo, fetches & merges upstream changes before pushing back to the student fork.
- **Lecturers** – `LecturerRepositoryManager` clones `<course>-assignments` repositories derived from course metadata and keeps them up to date.
- **Tutors** – Repository automation is not yet implemented; tutors browse submissions through the API-backed tree.

## Command execution
- All git operations run via `execAsync` and set `GIT_TERMINAL_PROMPT=0` to avoid interactive prompts.
- Authenticated clone URLs insert `oauth2:<token>` credentials (HTTPS).
- Errors are surfaced in VS Code notifications when critical; detailed output is logged to the console.

## Workspace layout
```
<workspace>/
  repo-one/
    assignment-a/
  repo-two/
    group-project/
```
Course content metadata is updated with absolute paths so the student tree can expose filesystem nodes directly.
