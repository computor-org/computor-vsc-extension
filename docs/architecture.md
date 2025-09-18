# Architecture

## Extension bootstrap
- `src/extension.ts` defines the login workflow, enforces that a workspace folder is open, and builds an HTTP client for the chosen auth mode.
- Role controllers (`LecturerController`, `StudentController`, `TutorController`) share a base class that wires the HTTP client into `ComputorApiService`, registers views/commands, and tracks disposables for logout.
- VS Code context keys (`computor.isLoggedIn`, `computor.<role>.show`) gate which views are visible.

## Services
- **ComputorApiService** – Central API gateway with retry, batching, caching, and performance logging.
- **GitLabTokenManager** – Retrieves/stores PATs per GitLab origin and builds authenticated clone URLs.
- **StudentRepositoryManager / LecturerRepositoryManager** – Shell out to `git` to clone/pull repositories and keep assignment directories in sync.
- **CourseSelectionService / TutorSelectionService** – Persist the currently selected course (plus group/member for tutors) and notify dependent views.
- **Status/Result services** – `StatusBarService`, `TutorStatusBarService`, and `TestResultService` provide live feedback and panels.

## UI surfaces
- **Trees** – Lecturer, student, and tutor tree providers live under `src/ui/tree/**` and transform API payloads into VS Code tree nodes. They honour cached expansion state and use `IconGenerator` for consistent glyphs.
- **Webviews** – Lecturer CRUD screens and the tutor filter panel use `WebviewViewProvider` with lightweight HTML/CSS served from the extension bundle.
- **Panels** – `TestResultsPanelProvider` renders structured test results for students.

## Data flow
1. Commands or tree interactions fire controller logic.
2. Controllers call services, which in turn use the injected HTTP client to reach the backend.
3. Responses are cached and mapped into tree nodes; filesystem checks add local context for assignments.
4. Git operations run via `execAsync` with tokens added to clone URLs.
5. Settings/markers persist state to disk so the next login resumes quickly.
