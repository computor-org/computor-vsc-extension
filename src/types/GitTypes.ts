import { SimpleGit } from 'simple-git';

export interface GitRepositoryInfo {
  path: string;
  isRepo: boolean;
  currentBranch?: string;
  remotes?: GitRemote[];
  isClean?: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  commit?: string;
}

export interface GitCommit {
  hash: string;
  date: Date;
  message: string;
  author: string;
  email: string;
}

export interface GitStashEntry {
  index: number;
  hash: string;
  message: string;
  date: Date;
  branch?: string;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  created: string[];
  deleted: string[];
  modified: string[];
  renamed: GitRenamedFile[];
  conflicted: string[];
  staged: string[];
  isClean: boolean;
}

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitRenamedFile {
  from: string;
  to: string;
}

export interface GitDiff {
  files: GitDiffFile[];
  insertions: number;
  deletions: number;
  changes: number;
}

export interface GitDiffFile {
  file: string;
  changes: number;
  insertions: number;
  deletions: number;
  binary: boolean;
  diff?: string;
}

export interface GitPushResult {
  pushed: GitPushedItem[];
  branch: GitBranchResult;
  ref: GitRefResult;
  remoteMessages: GitRemoteMessages;
}

export interface GitPushedItem {
  local: string;
  remote: string;
  success: boolean;
  alreadyUpdated: boolean;
}

export interface GitBranchResult {
  local: string;
  remote: string;
  remoteName: string;
}

export interface GitRefResult {
  local: string;
  remote: string;
}

export interface GitRemoteMessages {
  all: string[];
}

export interface GitCloneOptions {
  depth?: number;
  branch?: string;
  progress?: (progress: GitProgress) => void;
}

export interface GitProgress {
  method: string;
  stage: string;
  progress: number;
}

export interface GitError extends Error {
  code?: string;
  exitCode?: number;
  signal?: string;
}

export interface IGitWrapper {
  getRepository(path: string): Promise<SimpleGit>;
  isRepository(path: string): Promise<boolean>;
  getRepositoryInfo(path: string): Promise<GitRepositoryInfo>;
  
  // Repository operations
  init(path: string, bare?: boolean): Promise<void>;
  clone(url: string, localPath: string, options?: GitCloneOptions): Promise<void>;
  
  // Status operations
  status(path: string): Promise<GitStatus>;
  diff(path: string, options?: string[]): Promise<GitDiff>;
  
  // Branch operations
  getBranches(path: string): Promise<GitBranch[]>;
  getCurrentBranch(path: string): Promise<string | null>;
  createBranch(path: string, branchName: string): Promise<void>;
  checkoutBranch(path: string, branchName: string): Promise<void>;
  deleteBranch(path: string, branchName: string, force?: boolean): Promise<void>;
  mergeBranch(path: string, branchName: string): Promise<void>;
  
  // Commit operations
  add(path: string, files: string | string[]): Promise<void>;
  commit(path: string, message: string): Promise<void>;
  push(path: string, remote?: string, branch?: string): Promise<GitPushResult>;
  pull(path: string, remote?: string, branch?: string): Promise<void>;
  
  // Remote operations
  getRemotes(path: string): Promise<GitRemote[]>;
  addRemote(path: string, name: string, url: string): Promise<void>;
  removeRemote(path: string, name: string): Promise<void>;
  
  // History operations
  getLog(path: string, options?: { maxCount?: number }): Promise<GitCommit[]>;
  
  // Tag operations
  getTags(path: string): Promise<string[]>;
  createTag(path: string, tagName: string, message?: string): Promise<void>;
  deleteTag(path: string, tagName: string): Promise<void>;
  
  // Stash operations
  stash(path: string, options?: string[]): Promise<string>;
  stashPop(path: string, stashRef?: string): Promise<string>;
  stashApply(path: string, stashRef?: string): Promise<string>;
  stashDrop(path: string, stashRef?: string): Promise<string>;
  stashList(path: string): Promise<GitStashEntry[]>;
  stashClear(path: string): Promise<void>;
}