# Roles & Views

## Lecturers
- **Primary tree**: `computor.lecturer.courses` shows organisations, course families, courses, content, groups, and members.
- **Example library**: `computor.lecturer.examples` lists example repositories for quick assignment to course content.
- **Commands**: manage organisations/courses/content via webviews, assign/unassign examples, trigger deployments, open GitLab repos, and run `computor.lecturer.refresh` for cache busting.
- **Repositories**: `LecturerRepositoryManager` clones or updates assignments repositories under the workspace (or `~/.computor/lecturer-workspace` fallback) using GitLab tokens.

## Students
- **Course selection**: `.computor_student` stores the chosen course; `CourseSelectionService` ensures the workspace contains the working directory.
- **Tree**: `computor.student.courses` lists course units and assignments. When repositories are cloned, assignment nodes expose actual filesystem children.
- **Commands**: clone/update repositories, open README previews, prepare assignment branches, run tests, and submit results. `TestResultsPanel` displays execution output.
- **Repositories**: `StudentRepositoryManager` clones each submission repository into the first workspace folder, syncs against upstream templates when available, and updates course content metadata with absolute paths.

## Tutors
- **Filter panel**: Sidebar webview (`computor.tutor.filters`) lets tutors pick course, group, and member. Selection is persisted in global state.
- **Tree**: `computor.tutor.courses` mirrors course content for the selected member and highlights submission status via `IconGenerator` badges.
- **Commands**: reset filters, review submissions, and open related GitLab links. Automatic repository cloning is planned.

## Shared helpers
- **IconGenerator** ensures consistent coloured/annotated glyphs across trees.
- **Status bars**: Students and tutors receive status bar summaries of the current scope.
- **Caching**: Tree providers cache API payloads and expansion state with `ComputorSettingsManager` to minimise backend calls.
