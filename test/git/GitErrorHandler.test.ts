import * as chai from 'chai';
import { GitErrorHandler, GitErrorCode } from '../../src/git/GitErrorHandler';

const expect = chai.expect;

describe('GitErrorHandler', () => {
  describe('parseError', () => {
    it('should parse NOT_A_REPOSITORY error', () => {
      const error = new Error('fatal: not a git repository (or any of the parent directories): .git');
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.code).to.equal(GitErrorCode.NOT_A_REPOSITORY);
      expect(gitError.name).to.equal('GitError');
    });

    it('should parse BRANCH_EXISTS error', () => {
      const error = new Error('fatal: A branch named \'feature\' already exists.');
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.code).to.equal(GitErrorCode.BRANCH_EXISTS);
    });

    it('should parse UNCOMMITTED_CHANGES error', () => {
      const error = new Error('error: Your local changes to the following files would be overwritten by merge');
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.code).to.equal(GitErrorCode.UNCOMMITTED_CHANGES);
    });

    it('should parse AUTHENTICATION_FAILED error', () => {
      const error = new Error('fatal: Authentication failed for \'https://github.com/user/repo.git/\'');
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.code).to.equal(GitErrorCode.AUTHENTICATION_FAILED);
    });

    it('should include exit code and signal if present', () => {
      const error: any = new Error('Some git error');
      error.exitCode = 128;
      error.signal = 'SIGTERM';
      
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.exitCode).to.equal(128);
      expect(gitError.signal).to.equal('SIGTERM');
    });

    it('should return UNKNOWN_ERROR for unrecognized errors', () => {
      const error = new Error('Some unknown error');
      const gitError = GitErrorHandler.parseError(error);
      
      expect(gitError.code).to.equal(GitErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return friendly message for NOT_A_REPOSITORY', () => {
      const error: any = new Error('not a git repository');
      error.code = GitErrorCode.NOT_A_REPOSITORY;
      
      const message = GitErrorHandler.getUserFriendlyMessage(error);
      expect(message).to.equal('This folder is not a Git repository. Please initialize a repository first.');
    });

    it('should return friendly message for BRANCH_EXISTS', () => {
      const error: any = new Error('branch exists');
      error.code = GitErrorCode.BRANCH_EXISTS;
      
      const message = GitErrorHandler.getUserFriendlyMessage(error);
      expect(message).to.equal('A branch with this name already exists. Please choose a different name.');
    });

    it('should return original message for unknown errors', () => {
      const error: any = new Error('Some specific error');
      error.code = GitErrorCode.UNKNOWN_ERROR;
      
      const message = GitErrorHandler.getUserFriendlyMessage(error);
      expect(message).to.equal('Some specific error');
    });
  });

  describe('isRecoverable', () => {
    it('should return true for NETWORK_ERROR', () => {
      const error: any = new Error('network error');
      error.code = GitErrorCode.NETWORK_ERROR;
      
      const recoverable = GitErrorHandler.isRecoverable(error);
      expect(recoverable).to.be.true;
    });

    it('should return true for AUTHENTICATION_FAILED', () => {
      const error: any = new Error('auth failed');
      error.code = GitErrorCode.AUTHENTICATION_FAILED;
      
      const recoverable = GitErrorHandler.isRecoverable(error);
      expect(recoverable).to.be.true;
    });

    it('should return false for non-recoverable errors', () => {
      const error: any = new Error('branch exists');
      error.code = GitErrorCode.BRANCH_EXISTS;
      
      const recoverable = GitErrorHandler.isRecoverable(error);
      expect(recoverable).to.be.false;
    });
  });
});