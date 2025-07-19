import { GitWrapper } from '../../../src/git/GitWrapper';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SimpleGit, simpleGit } from 'simple-git';

describe('GitWrapper Integration Tests', () => {
  let gitWrapper: GitWrapper;
  let testRepoPath: string;
  let testRepoPath2: string;
  let git: SimpleGit;
  
  beforeAll(() => {
    gitWrapper = new GitWrapper();
  });
  
  beforeEach(async () => {
    // Create temporary test repository directory
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-test-'));
    testRepoPath = path.join(tmpDir, 'test-repo');
    testRepoPath2 = path.join(tmpDir, 'test-repo-2');
    await fs.promises.mkdir(testRepoPath, { recursive: true });
    await fs.promises.mkdir(testRepoPath2, { recursive: true });
    
    // Initialize git for direct operations
    git = simpleGit(testRepoPath);
  });
  
  afterEach(async () => {
    // Clean up test repositories
    if (testRepoPath && fs.existsSync(path.dirname(testRepoPath))) {
      await fs.promises.rm(path.dirname(testRepoPath), { recursive: true, force: true });
    }
  });
  
  describe('Repository Operations', () => {
    test('should initialize a new repository', async () => {
      await gitWrapper.init(testRepoPath);
      
      const isRepo = await gitWrapper.isRepository(testRepoPath);
      expect(isRepo).toBe(true);
      
      const gitDir = path.join(testRepoPath, '.git');
      expect(fs.existsSync(gitDir)).toBe(true);
    });
    
    test('should detect non-repository directory', async () => {
      const isRepo = await gitWrapper.isRepository(testRepoPath);
      expect(isRepo).toBe(false);
    });
    
    test('should get repository info', async () => {
      await gitWrapper.init(testRepoPath);
      
      const info = await gitWrapper.getRepositoryInfo(testRepoPath);
      expect(info.path).toBe(testRepoPath);
      expect(info.isRepo).toBe(true);
      expect(info.currentBranch).toBeDefined();
    });
    
    test('should validate repository path', async () => {
      await expect(gitWrapper.init('/invalid\0path')).rejects.toThrow();
    });
  });
  
  describe('File Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
    });
    
    test('should add and commit files', async () => {
      // Create a test file
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Hello World');
      
      // Add file
      await gitWrapper.add(testRepoPath, 'test.txt');
      
      // Commit
      await gitWrapper.commit(testRepoPath, 'Initial commit');
      
      // Check commit exists
      const log = await gitWrapper.getLog(testRepoPath, { maxCount: 1 });
      expect(log.length).toBe(1);
      expect(log[0].message).toBe('Initial commit');
    });
    
    test('should validate files before adding', async () => {
      await expect(gitWrapper.add(testRepoPath, '../../../etc/passwd')).rejects.toThrow('No valid files to add');
    });
    
    test('should validate commit message', async () => {
      await expect(gitWrapper.commit(testRepoPath, '')).rejects.toThrow('Invalid commit message');
    });
    
    test('should get status', async () => {
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Hello World');
      
      const status = await gitWrapper.status(testRepoPath);
      expect(status.files.length).toBeGreaterThan(0);
      expect(status.created).toContain('test.txt');
    });
    
    test('should get diff', async () => {
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Hello World');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
      
      await fs.promises.writeFile(testFile, 'Hello World Modified');
      
      const diff = await gitWrapper.diff(testRepoPath);
      expect(diff.files.length).toBe(1);
      expect(diff.files[0].file).toBe('test.txt');
    });
  });
  
  describe('Branch Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
      
      // Create initial commit
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Initial content');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
    });
    
    test('should create and checkout branch', async () => {
      await gitWrapper.createBranch(testRepoPath, 'feature/test-branch');
      
      const currentBranch = await gitWrapper.getCurrentBranch(testRepoPath);
      expect(currentBranch).toBe('feature/test-branch');
    });
    
    test('should validate branch name', async () => {
      await expect(gitWrapper.createBranch(testRepoPath, 'invalid branch')).rejects.toThrow('Invalid branch name');
      await expect(gitWrapper.createBranch(testRepoPath, 'HEAD')).rejects.toThrow('reserved Git name');
    });
    
    test('should list branches', async () => {
      await gitWrapper.createBranch(testRepoPath, 'feature/branch1');
      await gitWrapper.checkoutBranch(testRepoPath, 'master');
      await gitWrapper.createBranch(testRepoPath, 'feature/branch2');
      
      const branches = await gitWrapper.getBranches(testRepoPath);
      const branchNames = branches.map(b => b.name);
      
      expect(branchNames).toContain('master');
      expect(branchNames).toContain('feature/branch1');
      expect(branchNames).toContain('feature/branch2');
    });
    
    test('should delete branch', async () => {
      await gitWrapper.createBranch(testRepoPath, 'feature/to-delete');
      await gitWrapper.checkoutBranch(testRepoPath, 'master');
      
      await gitWrapper.deleteBranch(testRepoPath, 'feature/to-delete');
      
      const branches = await gitWrapper.getBranches(testRepoPath);
      const branchNames = branches.map(b => b.name);
      expect(branchNames).not.toContain('feature/to-delete');
    });
    
    test('should merge branches', async () => {
      // Create feature branch
      await gitWrapper.createBranch(testRepoPath, 'feature/merge-test');
      
      // Make changes in feature branch
      const testFile = path.join(testRepoPath, 'feature.txt');
      await fs.promises.writeFile(testFile, 'Feature content');
      await gitWrapper.add(testRepoPath, 'feature.txt');
      await gitWrapper.commit(testRepoPath, 'Add feature');
      
      // Switch back to master and merge
      await gitWrapper.checkoutBranch(testRepoPath, 'master');
      await gitWrapper.mergeBranch(testRepoPath, 'feature/merge-test');
      
      // Check file exists in master
      expect(fs.existsSync(testFile)).toBe(true);
    });
  });
  
  describe('Tag Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
      
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Initial content');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
    });
    
    test('should create and list tags', async () => {
      await gitWrapper.createTag(testRepoPath, 'v1.0.0', 'Version 1.0.0');
      await gitWrapper.createTag(testRepoPath, 'v1.0.1');
      
      const tags = await gitWrapper.getTags(testRepoPath);
      expect(tags).toContain('v1.0.0');
      expect(tags).toContain('v1.0.1');
    });
    
    test('should validate tag name', async () => {
      await expect(gitWrapper.createTag(testRepoPath, 'invalid tag')).rejects.toThrow('Invalid tag name');
      await expect(gitWrapper.createTag(testRepoPath, '@invalid')).rejects.toThrow('Invalid tag name');
    });
    
    test('should delete tag', async () => {
      await gitWrapper.createTag(testRepoPath, 'v1.0.0');
      await gitWrapper.deleteTag(testRepoPath, 'v1.0.0');
      
      const tags = await gitWrapper.getTags(testRepoPath);
      expect(tags).not.toContain('v1.0.0');
    });
  });
  
  describe('Stash Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
      
      // Create initial commit
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Initial content');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
      
      // Make changes to stash
      await fs.promises.writeFile(testFile, 'Modified content');
    });
    
    test('should stash changes', async () => {
      const result = await gitWrapper.stash(testRepoPath);
      expect(result).toContain('Saved working directory');
      
      // Check file reverted
      const content = await fs.promises.readFile(path.join(testRepoPath, 'test.txt'), 'utf8');
      expect(content).toBe('Initial content');
    });
    
    test('should stash with message', async () => {
      await gitWrapper.stash(testRepoPath, ['-m', 'Work in progress']);
      
      const stashList = await gitWrapper.stashList(testRepoPath);
      expect(stashList.length).toBeGreaterThan(0);
      expect(stashList[0].message).toContain('Work in progress');
    });
    
    test('should validate stash message', async () => {
      await expect(gitWrapper.stash(testRepoPath, ['-m', 'Invalid\nmessage'])).rejects.toThrow('Invalid stash message');
    });
    
    test('should pop stash', async () => {
      await gitWrapper.stash(testRepoPath);
      await gitWrapper.stashPop(testRepoPath);
      
      // Check changes restored
      const content = await fs.promises.readFile(path.join(testRepoPath, 'test.txt'), 'utf8');
      expect(content).toBe('Modified content');
    });
    
    test('should apply stash without removing', async () => {
      await gitWrapper.stash(testRepoPath);
      const stashList = await gitWrapper.stashList(testRepoPath);
      const stashRef = `stash@{${stashList[0].index}}`;
      
      await gitWrapper.stashApply(testRepoPath, stashRef);
      
      // Check changes restored
      const content = await fs.promises.readFile(path.join(testRepoPath, 'test.txt'), 'utf8');
      expect(content).toBe('Modified content');
      
      // Check stash still exists
      const newStashList = await gitWrapper.stashList(testRepoPath);
      expect(newStashList.length).toBe(1);
    });
    
    test('should drop specific stash', async () => {
      await gitWrapper.stash(testRepoPath, ['-m', 'First stash']);
      
      // Make another change
      await fs.promises.writeFile(path.join(testRepoPath, 'test.txt'), 'Another change');
      await gitWrapper.stash(testRepoPath, ['-m', 'Second stash']);
      
      const stashList = await gitWrapper.stashList(testRepoPath);
      expect(stashList.length).toBe(2);
      
      // Drop first stash
      await gitWrapper.stashDrop(testRepoPath, 'stash@{1}');
      
      const newStashList = await gitWrapper.stashList(testRepoPath);
      expect(newStashList.length).toBe(1);
      expect(newStashList[0].message).toContain('Second stash');
    });
    
    test('should clear all stashes', async () => {
      await gitWrapper.stash(testRepoPath, ['-m', 'First stash']);
      await fs.promises.writeFile(path.join(testRepoPath, 'test.txt'), 'Another change');
      await gitWrapper.stash(testRepoPath, ['-m', 'Second stash']);
      
      await gitWrapper.stashClear(testRepoPath);
      
      const stashList = await gitWrapper.stashList(testRepoPath);
      expect(stashList.length).toBe(0);
    });
  });
  
  describe('Remote Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
      
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Initial content');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
    });
    
    test('should add and list remotes', async () => {
      await gitWrapper.addRemote(testRepoPath, 'origin', 'https://github.com/user/repo.git');
      
      const remotes = await gitWrapper.getRemotes(testRepoPath);
      expect(remotes.length).toBe(1);
      expect(remotes[0].name).toBe('origin');
      expect(remotes[0].url).toBe('https://github.com/user/repo.git');
    });
    
    test('should validate remote name and URL', async () => {
      await expect(gitWrapper.addRemote(testRepoPath, 'invalid name', 'https://github.com/user/repo.git'))
        .rejects.toThrow('Invalid remote name');
      
      await expect(gitWrapper.addRemote(testRepoPath, 'origin', 'not-a-url'))
        .rejects.toThrow('Invalid remote URL');
    });
    
    test('should remove remote', async () => {
      await gitWrapper.addRemote(testRepoPath, 'origin', 'https://github.com/user/repo.git');
      await gitWrapper.removeRemote(testRepoPath, 'origin');
      
      const remotes = await gitWrapper.getRemotes(testRepoPath);
      expect(remotes.length).toBe(0);
    });
  });
  
  describe('Clone Operations', () => {
    test('should clone repository', async () => {
      // Initialize a source repository
      await gitWrapper.init(testRepoPath);
      const testFile = path.join(testRepoPath, 'test.txt');
      await fs.promises.writeFile(testFile, 'Clone test content');
      await gitWrapper.add(testRepoPath, 'test.txt');
      await gitWrapper.commit(testRepoPath, 'Initial commit');
      
      // Clone to new location
      await gitWrapper.clone(`file://${testRepoPath}`, testRepoPath2);
      
      // Verify clone
      const isRepo = await gitWrapper.isRepository(testRepoPath2);
      expect(isRepo).toBe(true);
      
      const clonedFile = path.join(testRepoPath2, 'test.txt');
      expect(fs.existsSync(clonedFile)).toBe(true);
      
      const content = await fs.promises.readFile(clonedFile, 'utf8');
      expect(content).toBe('Clone test content');
    });
    
    test('should validate clone URL', async () => {
      await expect(gitWrapper.clone('not-a-valid-url', testRepoPath2))
        .rejects.toThrow('Invalid Git URL');
    });
    
    test('should clone with options', async () => {
      // Initialize source repository with multiple commits
      await gitWrapper.init(testRepoPath);
      
      for (let i = 1; i <= 3; i++) {
        const testFile = path.join(testRepoPath, `file${i}.txt`);
        await fs.promises.writeFile(testFile, `Content ${i}`);
        await gitWrapper.add(testRepoPath, testFile);
        await gitWrapper.commit(testRepoPath, `Commit ${i}`);
      }
      
      // Clone with depth 1
      await gitWrapper.clone(`file://${testRepoPath}`, testRepoPath2, { depth: 1 });
      
      // Check shallow clone
      const log = await gitWrapper.getLog(testRepoPath2);
      expect(log.length).toBe(1);
      expect(log[0].message).toBe('Commit 3');
    });
  });
  
  describe('History Operations', () => {
    beforeEach(async () => {
      await gitWrapper.init(testRepoPath);
      
      // Create multiple commits
      for (let i = 1; i <= 5; i++) {
        const testFile = path.join(testRepoPath, `file${i}.txt`);
        await fs.promises.writeFile(testFile, `Content ${i}`);
        await gitWrapper.add(testRepoPath, testFile);
        await gitWrapper.commit(testRepoPath, `Commit ${i}`);
      }
    });
    
    test('should get commit log', async () => {
      const log = await gitWrapper.getLog(testRepoPath);
      expect(log.length).toBe(5);
      expect(log[0].message).toBe('Commit 5');
      expect(log[4].message).toBe('Commit 1');
    });
    
    test('should limit log entries', async () => {
      const log = await gitWrapper.getLog(testRepoPath, { maxCount: 3 });
      expect(log.length).toBe(3);
      expect(log[0].message).toBe('Commit 5');
      expect(log[2].message).toBe('Commit 3');
    });
  });
});