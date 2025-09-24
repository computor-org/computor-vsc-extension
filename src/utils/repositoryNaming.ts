import * as path from 'path';

export interface RepositoryContext {
  submissionRepo?: {
    full_path?: string;
    path?: string;
    clone_url?: string | null;
    url?: string | null;
    web_url?: string | null;
    provider_url?: string | null;
  };
  remoteUrl?: string;
  courseId?: string;
  memberId?: string;
  submissionGroupId?: string;
}

export function deriveRepositoryDirectoryName(context: RepositoryContext): string {
  const { submissionRepo, remoteUrl, courseId, memberId, submissionGroupId } = context;
  const candidates: Array<string | undefined> = [
    repoNameFromSubmissionRepository(submissionRepo),
    repoNameFromUrl(remoteUrl)
  ];

  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (slug) {
      return slug;
    }
  }

  const courseSlug = slugify(courseId) || 'course';
  const memberSlug = slugify(memberId) || slugify(submissionGroupId) || 'member';
  return `${courseSlug}-${memberSlug}`;
}

export function buildStudentRepoRoot(workspaceRoot: string, repoName: string): string {
  return path.join(workspaceRoot, 'students', repoName);
}

export function slugify(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const slug = value
    .toString()
    .trim()
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return slug || undefined;
}

function repoNameFromSubmissionRepository(repo?: RepositoryContext['submissionRepo']): string | undefined {
  if (!repo) {
    return undefined;
  }

  if (typeof repo.full_path === 'string' && repo.full_path.length > 0) {
    const parts = repo.full_path.split('/').filter(Boolean);
    const last = parts.pop();
    const slug = slugify(last);
    if (slug) {
      return slug;
    }
  }

  if (typeof repo.path === 'string' && repo.path.length > 0) {
    const slug = slugify(repo.path);
    if (slug) {
      return slug;
    }
  }

  return undefined;
}

function repoNameFromUrl(remoteUrl?: string): string | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  try {
    const url = new URL(remoteUrl);
    const pathname = url.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments.pop();
    const slug = slugify(last ? last.replace(/\.git$/, '') : undefined);
    if (slug) {
      return slug;
    }
  } catch {
    const parts = remoteUrl.split('/');
    const last = parts.pop();
    const slug = slugify(last ? last.replace(/\.git$/, '') : undefined);
    if (slug) {
      return slug;
    }
  }

  return undefined;
}
