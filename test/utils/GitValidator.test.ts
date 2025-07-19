import { expect } from 'chai';
import { GitValidator } from '../../src/utils/GitValidator';
import * as fs from 'fs';
import * as path from 'path';

describe('GitValidator', () => {
  // Store original fs.promises.stat for restoration
  let originalStat: typeof fs.promises.stat;

  before(() => {
    // Save the original fs.promises.stat method
    originalStat = fs.promises.stat;
  });

  after(() => {
    // Restore the original fs.promises.stat method
    fs.promises.stat = originalStat;
  });
  describe('isValidRepositoryPath', () => {
    it('should return true for valid directory path', async () => {
      const mockStat = { isDirectory: () => true };
      // @ts-ignore - mocking for test
      fs.promises.stat = async () => mockStat;
      
      const result = await GitValidator.isValidRepositoryPath('/path/to/repo');
      expect(result).to.be.true;
    });
    
    it('should return false for non-directory path', async () => {
      const mockStat = { isDirectory: () => false };
      // @ts-ignore - mocking for test
      fs.promises.stat = async () => mockStat;
      
      const result = await GitValidator.isValidRepositoryPath('/path/to/file.txt');
      expect(result).to.be.false;
    });
    
    it('should return false for non-existent path', async () => {
      // @ts-ignore - mocking for test
      fs.promises.stat = async () => {
        throw new Error('ENOENT');
      };
      
      const result = await GitValidator.isValidRepositoryPath('/non/existent/path');
      expect(result).to.be.false;
    });
  });
  
  describe('isValidBranchName', () => {
    it('should accept valid branch names', () => {
      expect(GitValidator.isValidBranchName('feature/new-feature')).to.be.true;
      expect(GitValidator.isValidBranchName('bugfix-123')).to.be.true;
      expect(GitValidator.isValidBranchName('release-1.0.0')).to.be.true;
      expect(GitValidator.isValidBranchName('main')).to.be.true;
      expect(GitValidator.isValidBranchName('develop')).to.be.true;
    });
    
    it('should reject empty branch names', () => {
      expect(GitValidator.isValidBranchName('')).to.be.false;
    });
    
    it('should reject reserved branch names', () => {
      expect(GitValidator.isValidBranchName('HEAD')).to.be.false;
      expect(GitValidator.isValidBranchName('FETCH_HEAD')).to.be.false;
      expect(GitValidator.isValidBranchName('ORIG_HEAD')).to.be.false;
      expect(GitValidator.isValidBranchName('MERGE_HEAD')).to.be.false;
      expect(GitValidator.isValidBranchName('CHERRY_PICK_HEAD')).to.be.false;
    });
    
    it('should reject branch names with invalid characters', () => {
      expect(GitValidator.isValidBranchName('feature branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature~branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature^branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature:branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature?branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature*branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature[branch]')).to.be.false;
      expect(GitValidator.isValidBranchName('feature\\branch')).to.be.false;
    });
    
    it('should reject branch names starting or ending with dot', () => {
      expect(GitValidator.isValidBranchName('.feature')).to.be.false;
      expect(GitValidator.isValidBranchName('feature.')).to.be.false;
    });
    
    it('should reject branch names starting or ending with slash', () => {
      expect(GitValidator.isValidBranchName('/feature')).to.be.false;
      expect(GitValidator.isValidBranchName('feature/')).to.be.false;
    });
    
    it('should reject branch names with consecutive dots or .lock', () => {
      expect(GitValidator.isValidBranchName('feature..branch')).to.be.false;
      expect(GitValidator.isValidBranchName('feature.lock')).to.be.false;
    });
  });
  
  describe('isValidTagName', () => {
    it('should accept valid tag names', () => {
      expect(GitValidator.isValidTagName('v1.0.0')).to.be.true;
      expect(GitValidator.isValidTagName('release-1.2.3')).to.be.true;
      expect(GitValidator.isValidTagName('beta')).to.be.true;
    });
    
    it('should reject empty tag names', () => {
      expect(GitValidator.isValidTagName('')).to.be.false;
    });
    
    it('should reject tag names with invalid characters', () => {
      expect(GitValidator.isValidTagName('v1.0 beta')).to.be.false;
      expect(GitValidator.isValidTagName('release@1.0')).to.be.false;
      expect(GitValidator.isValidTagName('tag{name}')).to.be.false;
    });
  });
  
  describe('isValidRemoteName', () => {
    it('should accept valid remote names', () => {
      expect(GitValidator.isValidRemoteName('origin')).to.be.true;
      expect(GitValidator.isValidRemoteName('upstream')).to.be.true;
      expect(GitValidator.isValidRemoteName('fork-123')).to.be.true;
      expect(GitValidator.isValidRemoteName('my_remote')).to.be.true;
    });
    
    it('should reject empty remote names', () => {
      expect(GitValidator.isValidRemoteName('')).to.be.false;
    });
    
    it('should reject remote names with invalid characters', () => {
      expect(GitValidator.isValidRemoteName('origin@main')).to.be.false;
      expect(GitValidator.isValidRemoteName('remote name')).to.be.false;
      expect(GitValidator.isValidRemoteName('remote/name')).to.be.false;
    });
  });
  
  describe('isValidGitUrl', () => {
    it('should accept valid SSH URLs', () => {
      expect(GitValidator.isValidGitUrl('git@github.com:user/repo.git')).to.be.true;
      expect(GitValidator.isValidGitUrl('ssh://git@github.com:user/repo.git')).to.be.true;
    });
    
    it('should accept valid HTTPS URLs', () => {
      expect(GitValidator.isValidGitUrl('https://github.com/user/repo.git')).to.be.true;
      expect(GitValidator.isValidGitUrl('http://gitlab.com/user/repo.git')).to.be.true;
    });
    
    it('should accept valid HTTP(S) URLs with authentication', () => {
      expect(GitValidator.isValidGitUrl('https://username:password@github.com/user/repo.git')).to.be.true;
      expect(GitValidator.isValidGitUrl('http://x-auth-token:glpat-token@localhost:8084/user/repo.git')).to.be.true;
      expect(GitValidator.isValidGitUrl('https://oauth2:token@gitlab.com/user/repo.git')).to.be.true;
    });
    
    it('should accept valid git protocol URLs', () => {
      expect(GitValidator.isValidGitUrl('git://github.com/user/repo.git')).to.be.true;
    });
    
    it('should accept valid file URLs', () => {
      expect(GitValidator.isValidGitUrl('file:///path/to/repo')).to.be.true;
    });
    
    it('should reject invalid URLs', () => {
      expect(GitValidator.isValidGitUrl('')).to.be.false;
      expect(GitValidator.isValidGitUrl('not-a-url')).to.be.false;
      expect(GitValidator.isValidGitUrl('https://github.com/user/repo')).to.be.false;
    });
  });
  
  describe('isValidCommitMessage', () => {
    it('should accept valid commit messages', () => {
      expect(GitValidator.isValidCommitMessage('Add new feature')).to.be.true;
      expect(GitValidator.isValidCommitMessage('Fix bug in authentication\n\nDetailed description')).to.be.true;
    });
    
    it('should reject empty commit messages', () => {
      expect(GitValidator.isValidCommitMessage('')).to.be.false;
      expect(GitValidator.isValidCommitMessage('   ')).to.be.false;
    });
    
    it('should reject single-line messages over 72 characters', () => {
      const longMessage = 'a'.repeat(73);
      expect(GitValidator.isValidCommitMessage(longMessage)).to.be.false;
    });
  });
  
  describe('isValidStashMessage', () => {
    it('should accept valid stash messages', () => {
      expect(GitValidator.isValidStashMessage('Work in progress')).to.be.true;
      expect(GitValidator.isValidStashMessage('')).to.be.true;
    });
    
    it('should reject stash messages with newlines', () => {
      expect(GitValidator.isValidStashMessage('Line 1\nLine 2')).to.be.false;
      expect(GitValidator.isValidStashMessage('Message\r\n')).to.be.false;
    });
  });
  
  describe('sanitizeBranchName', () => {
    it('should sanitize invalid characters', () => {
      expect(GitValidator.sanitizeBranchName('feature branch')).to.equal('feature-branch');
      expect(GitValidator.sanitizeBranchName('feature~branch')).to.equal('feature-branch');
      expect(GitValidator.sanitizeBranchName('feature?branch*')).to.equal('feature-branch-');
    });
    
    it('should remove leading and trailing dots and slashes', () => {
      expect(GitValidator.sanitizeBranchName('.feature.')).to.equal('feature');
      expect(GitValidator.sanitizeBranchName('/feature/')).to.equal('feature');
    });
    
    it('should replace .lock and consecutive dots', () => {
      expect(GitValidator.sanitizeBranchName('feature.lock')).to.equal('feature-lock');
      expect(GitValidator.sanitizeBranchName('feature..branch')).to.equal('feature-branch');
    });
    
    it('should prefix reserved names', () => {
      expect(GitValidator.sanitizeBranchName('HEAD')).to.equal('branch-HEAD');
    });
  });
  
  describe('validateFilePaths', () => {
    it('should validate single file path', () => {
      expect(GitValidator.validateFilePaths('src/file.ts')).to.deep.equal(['src/file.ts']);
    });
    
    it('should validate array of file paths', () => {
      const paths = ['src/file1.ts', 'src/file2.ts'];
      expect(GitValidator.validateFilePaths(paths)).to.deep.equal(paths);
    });
    
    it('should filter out invalid paths', () => {
      const paths = ['src/file.ts', '', '   ', '../outside/file.ts'];
      expect(GitValidator.validateFilePaths(paths)).to.deep.equal(['src/file.ts']);
    });
    
    it('should normalize paths', () => {
      expect(GitValidator.validateFilePaths('src//file.ts')).to.deep.equal([path.normalize('src//file.ts')]);
    });
  });
  
  describe('getInvalidBranchNameReason', () => {
    it('should return null for valid branch names', () => {
      expect(GitValidator.getInvalidBranchNameReason('feature/valid')).to.be.null;
    });
    
    it('should return specific reason for invalid branch names', () => {
      expect(GitValidator.getInvalidBranchNameReason('')).to.equal('Branch name cannot be empty');
      expect(GitValidator.getInvalidBranchNameReason('HEAD')).to.equal('"HEAD" is a reserved Git name');
      expect(GitValidator.getInvalidBranchNameReason('feature branch')).to.contain('invalid characters');
      expect(GitValidator.getInvalidBranchNameReason('.feature')).to.equal('Branch name cannot start or end with a dot');
      expect(GitValidator.getInvalidBranchNameReason('/feature')).to.equal('Branch name cannot start or end with a slash');
      expect(GitValidator.getInvalidBranchNameReason('feature..branch')).to.equal('Branch name cannot contain consecutive dots');
      expect(GitValidator.getInvalidBranchNameReason('feature.lock')).to.equal('Branch name cannot contain ".lock"');
    });
  });
  
  describe('getInvalidTagNameReason', () => {
    it('should return null for valid tag names', () => {
      expect(GitValidator.getInvalidTagNameReason('v1.0.0')).to.be.null;
    });
    
    it('should return specific reason for invalid tag names', () => {
      expect(GitValidator.getInvalidTagNameReason('')).to.equal('Tag name cannot be empty');
      expect(GitValidator.getInvalidTagNameReason('tag name')).to.contain('invalid characters');
      expect(GitValidator.getInvalidTagNameReason('.tag')).to.equal('Tag name cannot start or end with a dot');
    });
  });
});