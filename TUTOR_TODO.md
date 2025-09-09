Tutor View Integration TODOs

Backend routes needed (proposed)

- List tutor courses
  - GET /tutors/courses → [{ id, title, path, organization_id, repository? }]
  - Used by: TutorFilterPanel (courses dropdown), Tutor login sanity check

- List course groups for a course
  - GET /tutors/courses/{courseId}/groups → CourseGroupList[]
  - Used by: TutorFilterPanel (groups dropdown)

- List course members for a course (optionally filtered by group)
  - GET /tutors/courses/{courseId}/members?group_id=... → [{ id, user:{ full_name, username }, ... }]
  - Used by: TutorFilterPanel (members dropdown)

- Course contents for a member in a course
  - GET /tutors/course-contents?course_id={courseId}&member_id={memberId} → CourseContentStudentList[] enriched with per-member submission state
  - Fields used for icons and descriptions:
    - course_content_type { id, title, color, course_content_kind_id }
    - path, title, position
    - submission_group or submission: { repository?, latest_grading? { grading:number [0..1], status: 'corrected' | 'correction_necessary' | 'correction_possible' }, grading? }
  - Used by: TutorStudentTreeProvider to build hierarchy and show status badges

- Student repository metadata
  - GET /tutors/repositories?course_id={courseId}&member_id={memberId} → { remote_url }
  - Used by: computor.tutor.cloneStudentRepository to avoid prompting for URL

- Submission branch for a student’s assignment
  - GET /tutors/submission-branch?course_id={courseId}&member_id={memberId}&course_content_id={contentId} → { branch: string }
  - Used by: computor.tutor.checkoutAssignment to select the correct branch

- Example download for comparison (if different from existing)
  - Existing: GET /examples or POST /examples/download
  - If tutor-specific route exists, provide: example files (meta.yaml, test.yaml, etc.)

Frontend wiring points

- src/services/ComputorApiService.ts
  - Implement:
    - getTutorCourseGroups(courseId)
    - getTutorCourseMembers(courseId, groupId?)
    - getTutorCourseContents(courseId, memberId)
    - getTutorStudentRepository(courseId, memberId)
    - getTutorSubmissionBranch(courseId, memberId, courseContentId)

- src/ui/panels/TutorFilterPanel.ts
  - Currently calls the above via selection; labels propagated to status bar.

- src/ui/tree/tutor/TutorStudentTreeProvider.ts
  - Uses getTutorCourseContents; falls back to student endpoint until implemented.

- src/commands/TutorCommands.ts
  - cloneStudentRepository: replace prompt with getTutorStudentRepository
  - checkoutAssignment: replace branch prompt with getTutorSubmissionBranch

Notes

- Icons: Student logic reused for tutors—center check (100%), red cross (<100%), corner dot for correction status (green/red/orange). Colors are generated dynamically and cached.
- Tutor status bar: shows Course | Group | Member with labels supplied by the filters webview.

