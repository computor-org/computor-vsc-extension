import * as fs from 'fs';
import * as path from 'path';

const backupRootDir = '.backups';

function sanitizeTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[:.]/g, '-');
}

async function copyDirectoryExcludingGit(src: string, dest: string): Promise<void> {
  const stat = await fs.promises.stat(src);
  if (!stat.isDirectory()) {
    throw new Error(`Source path "${src}" is not a directory`);
  }

  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git') {
      continue;
    }

    const sourceEntry = path.join(src, entry.name);
    const targetEntry = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryExcludingGit(sourceEntry, targetEntry);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fs.promises.readlink(sourceEntry);
      await fs.promises.symlink(linkTarget, targetEntry);
    } else if (entry.isFile()) {
      await fs.promises.copyFile(sourceEntry, targetEntry);
    }
  }
}

export async function createRepositoryBackup(
  repoPath: string,
  workspaceRoot: string,
  options?: { repoName?: string; timestamp?: Date }
): Promise<string | undefined> {
  try {
    const stats = await fs.promises.stat(repoPath);
    if (!stats.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const repoName = options?.repoName || path.basename(repoPath);
  const timestamp = sanitizeTimestamp(options?.timestamp ?? new Date());
  const backupsRoot = path.join(workspaceRoot, backupRootDir);
  const backupPath = path.join(backupsRoot, `${repoName}_${timestamp}`);

  await fs.promises.mkdir(backupsRoot, { recursive: true });
  await fs.promises.rm(backupPath, { force: true, recursive: true });
  await copyDirectoryExcludingGit(repoPath, backupPath);

  return backupPath;
}

export function isHistoryRewriteError(error: any): boolean {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const combined = `${stderr}\n${stdout}\n${message}`.toLowerCase();

  return combined.includes('not possible to fast-forward') ||
    combined.includes('refusing to merge unrelated histories') ||
    combined.includes('fatal: unrelated histories');
}
