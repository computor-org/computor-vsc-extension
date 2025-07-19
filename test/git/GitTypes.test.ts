import * as chai from 'chai';
import { GitErrorCode } from '../../src/git/GitErrorHandler';

const expect = chai.expect;

describe('Git Types', () => {
  describe('GitErrorCode', () => {
    it('should have correct error codes', () => {
      expect(GitErrorCode.REPOSITORY_NOT_FOUND).to.equal('REPOSITORY_NOT_FOUND');
      expect(GitErrorCode.NOT_A_REPOSITORY).to.equal('NOT_A_REPOSITORY');
      expect(GitErrorCode.BRANCH_EXISTS).to.equal('BRANCH_EXISTS');
      expect(GitErrorCode.BRANCH_NOT_FOUND).to.equal('BRANCH_NOT_FOUND');
      expect(GitErrorCode.UNCOMMITTED_CHANGES).to.equal('UNCOMMITTED_CHANGES');
      expect(GitErrorCode.MERGE_CONFLICT).to.equal('MERGE_CONFLICT');
      expect(GitErrorCode.REMOTE_NOT_FOUND).to.equal('REMOTE_NOT_FOUND');
      expect(GitErrorCode.AUTHENTICATION_FAILED).to.equal('AUTHENTICATION_FAILED');
      expect(GitErrorCode.NETWORK_ERROR).to.equal('NETWORK_ERROR');
      expect(GitErrorCode.PERMISSION_DENIED).to.equal('PERMISSION_DENIED');
      expect(GitErrorCode.UNKNOWN_ERROR).to.equal('UNKNOWN_ERROR');
    });
  });
});