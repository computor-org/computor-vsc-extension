import { GitValidator } from '../../src/utils/GitValidator';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

describe('GitValidator', () => {
  describe('isValidRepositoryPath', () => {
    it('should return true for valid directory path', async () => {
      const mockStat = { isDirectory: () => true };
      (fs.promises.stat as jest.Mock).mockResolvedValue(mockStat);
      
      const result = await GitValidator.isValidRepositoryPath('/path/to/repo');
      expect(result).toBe(true);
    });
    
    it('should return false for non-directory path', async () => {
      const mockStat = { isDirectory: () => false };
      (fs.promises.stat as jest.Mock).mockResolvedValue(mockStat);
      
      const result = await GitValidator.isValidRepositoryPath('/path/to/file.txt');
      expect(result).toBe(false);
    });
    
    it('should return false for non-existent path', async () => {
      (fs.promises.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      const result = await GitValidator.isValidRepositoryPath('/non/existent/path');
      expect(result).toBe(false);
    });
  });
  
  describe('isValidBranchName', () => {
    it('should accept valid branch names', () => {
      expect(GitValidator.isValidBranchName('feature/new-feature')).toBe(true);
      expect(GitValidator.isValidBranchName('bugfix-123')).toBe(true);
      expect(GitValidator.isValidBranchName('release-1.0.0')).toBe(true);
      expect(GitValidator.isValidBranchName('main')).toBe(true);
      expect(GitValidator.isValidBranchName('develop')).toBe(true);
    });
    
    it('should reject empty branch names', () => {
      expect(GitValidator.isValidBranchName('')).toBe(false);
    });
    
    it('should reject reserved branch names', () => {
      expect(GitValidator.isValidBranchName('HEAD')).toBe(false);
      expect(GitValidator.isValidBranchName('FETCH_HEAD')).toBe(false);
      expect(GitValidator.isValidBranchName('ORIG_HEAD')).toBe(false);
      expect(GitValidator.isValidBranchName('MERGE_HEAD')).toBe(false);
      expect(GitValidator.isValidBranchName('CHERRY_PICK_HEAD')).toBe(false);
    });
    
    it('should reject branch names with invalid characters', () => {
      expect(GitValidator.isValidBranchName('feature branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature~branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature^branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature:branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature?branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature*branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature[branch]')).toBe(false);
      expect(GitValidator.isValidBranchName('feature\\branch')).toBe(false);
    });
    
    it('should reject branch names starting or ending with dot', () => {
      expect(GitValidator.isValidBranchName('.feature')).toBe(false);
      expect(GitValidator.isValidBranchName('feature.')).toBe(false);
    });
    
    it('should reject branch names starting or ending with slash', () => {
      expect(GitValidator.isValidBranchName('/feature')).toBe(false);
      expect(GitValidator.isValidBranchName('feature/')).toBe(false);
    });
    
    it('should reject branch names with consecutive dots or .lock', () => {
      expect(GitValidator.isValidBranchName('feature..branch')).toBe(false);
      expect(GitValidator.isValidBranchName('feature.lock')).toBe(false);
    });
  });
  
  describe('isValidTagName', () => {
    it('should accept valid tag names', () => {
      expect(GitValidator.isValidTagName('v1.0.0')).toBe(true);
      expect(GitValidator.isValidTagName('release-1.2.3')).toBe(true);
      expect(GitValidator.isValidTagName('beta')).toBe(true);
    });
    
    it('should reject empty tag names', () => {
      expect(GitValidator.isValidTagName('')).toBe(false);
    });
    
    it('should reject tag names with invalid characters', () => {
      expect(GitValidator.isValidTagName('v1.0 beta')).toBe(false);
      expect(GitValidator.isValidTagName('release@1.0')).toBe(false);
      expect(GitValidator.isValidTagName('tag{name}')).toBe(false);
    });
  });
  
  describe('isValidRemoteName', () => {
    it('should accept valid remote names', () => {
      expect(GitValidator.isValidRemoteName('origin')).toBe(true);
      expect(GitValidator.isValidRemoteName('upstream')).toBe(true);
      expect(GitValidator.isValidRemoteName('fork-123')).toBe(true);
      expect(GitValidator.isValidRemoteName('my_remote')).toBe(true);
    });
    
    it('should reject empty remote names', () => {
      expect(GitValidator.isValidRemoteName('')).toBe(false);
    });
    
    it('should reject remote names with invalid characters', () => {
      expect(GitValidator.isValidRemoteName('origin@main')).toBe(false);
      expect(GitValidator.isValidRemoteName('remote name')).toBe(false);
      expect(GitValidator.isValidRemoteName('remote/name')).toBe(false);
    });
  });
  
  describe('isValidGitUrl', () => {
    it('should accept valid SSH URLs', () => {
      expect(GitValidator.isValidGitUrl('git@github.com:user/repo.git')).toBe(true);
      expect(GitValidator.isValidGitUrl('ssh://git@github.com:user/repo.git')).toBe(true);
    });
    
    it('should accept valid HTTPS URLs', () => {
      expect(GitValidator.isValidGitUrl('https://github.com/user/repo.git')).toBe(true);
      expect(GitValidator.isValidGitUrl('http://gitlab.com/user/repo.git')).toBe(true);
    });
    
    it('should accept valid git protocol URLs', () => {
      expect(GitValidator.isValidGitUrl('git://github.com/user/repo.git')).toBe(true);
    });
    
    it('should accept valid file URLs', () => {
      expect(GitValidator.isValidGitUrl('file:///path/to/repo')).toBe(true);
    });
    
    it('should reject invalid URLs', () => {
      expect(GitValidator.isValidGitUrl('')).toBe(false);
      expect(GitValidator.isValidGitUrl('not-a-url')).toBe(false);
      expect(GitValidator.isValidGitUrl('https://github.com/user/repo')).toBe(false);
    });
  });
  
  describe('isValidCommitMessage', () => {
    it('should accept valid commit messages', () => {
      expect(GitValidator.isValidCommitMessage('Add new feature')).toBe(true);
      expect(GitValidator.isValidCommitMessage('Fix bug in authentication\n\nDetailed description')).toBe(true);
    });
    
    it('should reject empty commit messages', () => {
      expect(GitValidator.isValidCommitMessage('')).toBe(false);
      expect(GitValidator.isValidCommitMessage('   ')).toBe(false);
    });
    
    it('should reject single-line messages over 72 characters', () => {
      const longMessage = 'a'.repeat(73);
      expect(GitValidator.isValidCommitMessage(longMessage)).toBe(false);
    });
  });
  
  describe('isValidStashMessage', () => {
    it('should accept valid stash messages', () => {
      expect(GitValidator.isValidStashMessage('Work in progress')).toBe(true);
      expect(GitValidator.isValidStashMessage('')).toBe(true);
    });
    
    it('should reject stash messages with newlines', () => {
      expect(GitValidator.isValidStashMessage('Line 1\nLine 2')).toBe(false);
      expect(GitValidator.isValidStashMessage('Message\r\n')).toBe(false);
    });
  });
  
  describe('sanitizeBranchName', () => {
    it('should sanitize invalid characters', () => {
      expect(GitValidator.sanitizeBranchName('feature branch')).toBe('feature-branch');
      expect(GitValidator.sanitizeBranchName('feature~branch')).toBe('feature-branch');
      expect(GitValidator.sanitizeBranchName('feature?branch*')).toBe('feature-branch-');
    });
    
    it('should remove leading and trailing dots and slashes', () => {
      expect(GitValidator.sanitizeBranchName('.feature.')).toBe('feature');
      expect(GitValidator.sanitizeBranchName('/feature/')).toBe('feature');
    });
    
    it('should replace .lock and consecutive dots', () => {
      expect(GitValidator.sanitizeBranchName('feature.lock')).toBe('feature-lock');
      expect(GitValidator.sanitizeBranchName('feature..branch')).toBe('feature-branch');
    });
    
    it('should prefix reserved names', () => {
      expect(GitValidator.sanitizeBranchName('HEAD')).toBe('branch-HEAD');
    });
  });
  
  describe('validateFilePaths', () => {
    it('should validate single file path', () => {
      expect(GitValidator.validateFilePaths('src/file.ts')).toEqual(['src/file.ts']);
    });
    
    it('should validate array of file paths', () => {
      const paths = ['src/file1.ts', 'src/file2.ts'];
      expect(GitValidator.validateFilePaths(paths)).toEqual(paths);
    });
    
    it('should filter out invalid paths', () => {
      const paths = ['src/file.ts', '', '   ', '../outside/file.ts'];
      expect(GitValidator.validateFilePaths(paths)).toEqual(['src/file.ts']);
    });
    
    it('should normalize paths', () => {
      expect(GitValidator.validateFilePaths('src//file.ts')).toEqual([path.normalize('src//file.ts')]);
    });
  });
  
  describe('getInvalidBranchNameReason', () => {
    it('should return null for valid branch names', () => {
      expect(GitValidator.getInvalidBranchNameReason('feature/valid')).toBeNull();
    });
    
    it('should return specific reason for invalid branch names', () => {
      expect(GitValidator.getInvalidBranchNameReason('')).toBe('Branch name cannot be empty');
      expect(GitValidator.getInvalidBranchNameReason('HEAD')).toBe('"HEAD" is a reserved Git name');
      expect(GitValidator.getInvalidBranchNameReason('feature branch')).toContain('invalid characters');
      expect(GitValidator.getInvalidBranchNameReason('.feature')).toBe('Branch name cannot start or end with a dot');
      expect(GitValidator.getInvalidBranchNameReason('/feature')).toBe('Branch name cannot start or end with a slash');
      expect(GitValidator.getInvalidBranchNameReason('feature..branch')).toBe('Branch name cannot contain consecutive dots');
      expect(GitValidator.getInvalidBranchNameReason('feature.lock')).toBe('Branch name cannot contain ".lock"');
    });
  });
  
  describe('getInvalidTagNameReason', () => {
    it('should return null for valid tag names', () => {
      expect(GitValidator.getInvalidTagNameReason('v1.0.0')).toBeNull();
    });
    
    it('should return specific reason for invalid tag names', () => {
      expect(GitValidator.getInvalidTagNameReason('')).toBe('Tag name cannot be empty');
      expect(GitValidator.getInvalidTagNameReason('tag name')).toContain('invalid characters');
      expect(GitValidator.getInvalidTagNameReason('.tag')).toBe('Tag name cannot start or end with a dot');
    });
  });
});