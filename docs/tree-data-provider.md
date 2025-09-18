# Tree Providers

## Lecturer tree
- File: `src/ui/tree/lecturer/LecturerTreeDataProvider.ts`.
- Displays organisations → course families → courses → content → groups/members.
- Uses `VirtualScrollingService` for large lists, drag-and-drop for reordering, and persists expansion state through `ComputorSettingsManager`.

## Student tree
- File: `src/ui/tree/student/StudentCourseContentTreeProvider.ts`.
- Builds a virtual hierarchy from course content metadata and augments assignment nodes with local filesystem entries when repositories are present.
- Supports targeted refresh (`refreshContentItem`) and keeps per-course caches to minimise API traffic.

## Tutor tree
- File: `src/ui/tree/tutor/TutorStudentTreeProvider.ts`.
- Mirrors the student hierarchy for the tutor-selected member, highlighting submission status with `IconGenerator` badges.
- Reacts to `TutorSelectionService` events to refresh when filters change.

## Shared behaviour
- Providers emit `onDidChangeTreeData` to refresh the UI and reuse cached expansion state from `ComputorSettingsManager`.
- Icons are generated dynamically to keep colouring consistent across roles.
