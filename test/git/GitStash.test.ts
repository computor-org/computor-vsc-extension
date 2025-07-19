import * as chai from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitWrapper } from '../../src/git/GitWrapper';

const expect = chai.expect;

describe('Git Stash Operations', () => {
  let gitWrapper: GitWrapper;
  let testRepoPath: string;

  beforeEach(async () => {
    gitWrapper = new GitWrapper();
    
    // Create a temporary directory for testing
    const tempDir = os.tmpdir();
    testRepoPath = path.join(tempDir, `git-stash-test-${Date.now()}`);
    await fs.promises.mkdir(testRepoPath, { recursive: true });
    
    // Initialize repo and configure
    await gitWrapper.init(testRepoPath);
    const git = await gitWrapper.getRepository(testRepoPath);
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Create initial commit
    const testFile = path.join(testRepoPath, 'test.txt');
    await fs.promises.writeFile(testFile, 'initial content');
    await gitWrapper.add(testRepoPath, '.');
    await gitWrapper.commit(testRepoPath, 'Initial commit');
  });

  afterEach(async () => {
    // Clean up
    gitWrapper.dispose();
    
    if (fs.existsSync(testRepoPath)) {
      await fs.promises.rm(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('stash', () => {
    it('should stash uncommitted changes', async () => {
      // Make changes
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'modified content');
      
      // Stash changes
      const result = await gitWrapper.stash(testRepoPath);
      expect(result).to.be.a('string');
      
      // Check working directory is clean
      const status = await gitWrapper.status(testRepoPath);
      expect(status.isClean).to.be.true;
    });

    it('should stash with custom message', async () => {
      // Make changes
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'modified content');
      
      // Stash with message
      await gitWrapper.stash(testRepoPath, ['push', '-m', 'Work in progress']);
      
      // Check stash list contains our message
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(1);
      expect(stashes[0].message).to.include('Work in progress');
    });

    it('should include untracked files by default', async () => {
      // Create new untracked file
      const newFile = path.join(testRepoPath, 'new.txt');
      await fs.promises.writeFile(newFile, 'new file content');
      
      // Stash
      await gitWrapper.stash(testRepoPath);
      
      // Check file is gone
      const exists = fs.existsSync(newFile);
      expect(exists).to.be.false;
    });
  });

  describe('stashList', () => {
    it('should return empty array when no stashes', async () => {
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.be.an('array');
      expect(stashes).to.have.lengthOf(0);
    });

    it('should list multiple stashes', async () => {
      const testFile = path.join(testRepoPath, 'test.txt');
      
      // Create first stash
      await fs.promises.writeFile(testFile, 'first change');
      await gitWrapper.stash(testRepoPath, ['push', '-m', 'First stash']);
      
      // Create second stash
      await fs.promises.writeFile(testFile, 'second change');
      await gitWrapper.stash(testRepoPath, ['push', '-m', 'Second stash']);
      
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(2);
      expect(stashes[0].index).to.equal(0);
      expect(stashes[0].message).to.include('Second stash');
      expect(stashes[1].index).to.equal(1);
      expect(stashes[1].message).to.include('First stash');
    });

    it('should parse stash entry details', async () => {
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'modified');
      await gitWrapper.stash(testRepoPath);
      
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes[0]).to.have.property('hash');
      expect(stashes[0]).to.have.property('date');
      expect(stashes[0].date).to.be.instanceOf(Date);
    });
  });

  describe('stashPop', () => {
    beforeEach(async () => {
      // Create a stash
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'stashed content');
      await gitWrapper.stash(testRepoPath);
    });

    it('should apply and remove stash', async () => {
      await gitWrapper.stashPop(testRepoPath);
      
      // Check changes are restored
      const testFile = path.join(testRepoPath, 'test.txt');
      const content = await fs.promises.readFile(testFile, 'utf8');
      expect(content).to.equal('stashed content');
      
      // Check stash is removed
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(0);
    });

    it('should pop specific stash', async () => {
      // Create another stash
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'second stash');
      await gitWrapper.stash(testRepoPath);
      
      // Pop the older stash
      await gitWrapper.stashPop(testRepoPath, 'stash@{1}');
      
      // Check correct content is restored
      const content = await fs.promises.readFile(testFile, 'utf8');
      expect(content).to.equal('stashed content');
      
      // Check only one stash remains
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(1);
    });
  });

  describe('stashApply', () => {
    beforeEach(async () => {
      // Create a stash
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'stashed content');
      await gitWrapper.stash(testRepoPath);
    });

    it('should apply stash without removing it', async () => {
      await gitWrapper.stashApply(testRepoPath);
      
      // Check changes are restored
      const testFile = path.join(testRepoPath, 'test.txt');
      const content = await fs.promises.readFile(testFile, 'utf8');
      expect(content).to.equal('stashed content');
      
      // Check stash still exists
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(1);
    });
  });

  describe('stashDrop', () => {
    beforeEach(async () => {
      // Create multiple stashes
      const testFile = path.join(testRepoPath, 'test.txt');
      
      await fs.promises.writeFile(testFile, 'first');
      await gitWrapper.stash(testRepoPath);
      
      await fs.promises.writeFile(testFile, 'second');
      await gitWrapper.stash(testRepoPath);
    });

    it('should drop latest stash by default', async () => {
      await gitWrapper.stashDrop(testRepoPath);
      
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(1);
    });

    it('should drop specific stash', async () => {
      await gitWrapper.stashDrop(testRepoPath, 'stash@{1}');
      
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(1);
    });
  });

  describe('stashClear', () => {
    it('should remove all stashes', async () => {
      const testFile = path.join(testRepoPath, 'test.txt');
      
      // Create multiple stashes
      for (let i = 1; i <= 3; i++) {
        await fs.promises.writeFile(testFile, `change ${i}`);
        await gitWrapper.stash(testRepoPath);
      }
      
      // Clear all stashes
      await gitWrapper.stashClear(testRepoPath);
      
      const stashes = await gitWrapper.stashList(testRepoPath);
      expect(stashes).to.have.lengthOf(0);
    });
  });
});