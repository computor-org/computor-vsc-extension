# Submission System Refactoring

## Date: 2024-09-29

## Overview
Major refactoring of the submission system to introduce artifact-based tracking, proper grading, and review functionality. This refactoring also includes comprehensive renaming from `course_submission_*` to `submission_*` for consistency and clarity.

## Key Changes

### 1. Naming Convention Changes
All references to `course_submission_*` have been renamed to `submission_*`:

- **Tables**:
  - `course_submission_group` → `submission_group`
  - `course_submission_group_member` → `submission_group_member`
  - `course_submission_group_grading` → `submission_grade` (also restructured)

- **Columns**:
  - `course_submission_group_id` → `submission_group_id` (in all tables)

- **Relationships**:
  - `course_submission_groups` → `submission_groups`

- **Classes/Models**:
  - `CourseSubmissionGroup` → `SubmissionGroup`
  - `CourseSubmissionGroupMember` → `SubmissionGroupMember`
  - `CourseSubmissionGroupGrading` → `SubmissionGrade`

### 2. New Artifact-Based System

#### New Tables Created

**`submission_artifact`**
- Tracks student uploaded files (submissions)
- Stores metadata about uploaded ZIP archives
- Links to MinIO/S3 storage
- Key fields:
  - `submission_group_id` - which group submitted
  - `uploaded_by_course_member_id` - who uploaded
  - `content_type`, `file_size`, `bucket_name`, `object_key` - storage info
  - `properties` (JSONB) - flexible metadata (version_identifier, commit hash, etc.)

**`result_artifact`**
- Tracks files generated from test execution
- Stores test outputs, logs, reports
- Similar structure to submission_artifact but linked to test results

**`submission_grade`**
- Replaces old `course_submission_group_grading`
- Grades are now tied to specific submission artifacts
- Key fields:
  - `artifact_id` - which submission is being graded
  - `graded_by_course_member_id` - who graded
  - `grade` (float) - percentage score (0.0 to 1.0)
  - `status` (int) - grading status enum:
    - 0: NOT_REVIEWED
    - 1: CORRECTED
    - 2: CORRECTION_NECESSARY
    - 3: IMPROVEMENT_POSSIBLE
  - `comment` - grader feedback

**`submission_review`**
- New table for review comments on submissions
- Supports peer review and instructor feedback
- Key fields:
  - `artifact_id` - which submission is being reviewed
  - `reviewer_course_member_id` - who reviewed
  - `body` - review text
  - `review_type` - e.g., 'peer', 'instructor', 'automated'

### 3. Result Table Enhancements

The `Result` table has been enhanced with new fields:
- `submission_artifact_id` - links test results to specific submission artifacts
- `grade` - stores test score as percentage
- `log_text` - stores execution logs
- `started_at`, `finished_at` - test execution timestamps

New indexes for better query performance:
- `result_submission_artifact_idx`
- `result_created_at_idx`
- `result_artifact_unique_success` - ensures only one successful test per artifact per member

### 4. Removed Features

- **Filename fields removed** from artifact tables since we store ZIP archives containing multiple files
- **Old grading table** (`course_submission_group_grading`) completely removed
- **Score/max_score pattern** replaced with single percentage `grade` field

## Migration Strategy

Since there are no production databases, all changes were merged into the initial migration (`6c2c37382ca7_initial_schema_from_sqlalchemy_models.py`). This provides a clean starting point with:
- Proper naming from the start
- All artifact tables included
- No need for complex migration logic

## Benefits

1. **Clearer naming** - `submission_*` is more intuitive than `course_submission_*`
2. **Better tracking** - Every submission is now an artifact with full metadata
3. **Flexible grading** - Multiple grades per submission, status tracking
4. **Review support** - Built-in support for peer review and feedback
5. **Test integration** - Test results directly linked to submission artifacts
6. **Storage optimization** - Designed for ZIP archive storage, not individual files

## API Impact

All API endpoints and interfaces have been updated to use the new naming:
- DTOs updated in `/interface` directory
- API endpoints in `/api` directory updated
- All imports and references updated

## Testing Workflow

The new system supports this workflow:
1. Student uploads submission → creates `submission_artifact`
2. Test runs against artifact → creates/updates `Result` with `submission_artifact_id`
3. Test outputs saved → creates `result_artifact` entries
4. Grader reviews submission → creates `submission_grade`
5. Peers/instructors comment → creates `submission_review` entries