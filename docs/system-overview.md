# System Overview

## Purpose
The Computor VS Code extension is the desktop front end for the Computor teaching platform. It connects to the REST backend, manages local Git repositories, and shows course data through role-specific trees and webviews.

## Startup flow
1. User runs `Computor: Login`.
2. `src/extension.ts` ensures a workspace folder is open, collects the backend URL, and prompts for credentials (basic auth, API key, or pasted JWT).
3. The unified controller queries available views using `/user/courses/{course_id}/views` endpoint and dynamically initializes student, tutor, and/or lecturer views based on user permissions.
4. Shared services (API, token, repository managers) handle data loading and Git operations in the background.

## Components
- **Extension host** – Command registrations, status bar updates, and panel creation happen in `extension.ts`.
- **Computor backend** – FastAPI service that exposes organisations, courses, assignments, and submission APIs.
- **GitLab** – Stores course and assignment repositories. Tokens are stored in VS Code secret storage and injected during clone/pull operations.

## Role snapshots
- **Lecturers** get organisation/course trees, example library access, and deployment commands.
- **Students** see course content, trigger repository cloning, manage assignment branches, and submit tests.
- **Tutors** filter by course/group/member to review student submissions (workspace automation is planned but not yet live).

## Data persistence
- Configuration lives in `~/.computor/config.json` (backend URL, preferred auth mode, tree expansion state).
- Course marker file (`.computor`) sits in the workspace root to remember the active course between sessions. All roles share this course selection.
- Secrets (login payloads, GitLab tokens) are stored via VS Code SecretStorage.
