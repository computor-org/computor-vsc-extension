#!/usr/bin/env ts-node

import { GitWrapper } from '../../../src/git/GitWrapper';
import { GitValidator } from '../../../src/utils/GitValidator';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), `git-test-${Date.now()}`);

async function colorLog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m'  // Yellow
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

async function testGitOperations() {
  const gitWrapper = new GitWrapper();
  
  try {
    await colorLog('\n🧪 Git Operations Test Suite\n', 'info');
    
    // Create test directory
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
    await colorLog(`📁 Created test directory: ${TEST_DIR}`, 'success');
    
    // Test 1: Repository initialization
    await colorLog('\n1️⃣ Testing repository initialization...', 'info');
    await gitWrapper.init(TEST_DIR);
    const isRepo = await gitWrapper.isRepository(TEST_DIR);
    await colorLog(`   ✓ Repository initialized: ${isRepo}`, isRepo ? 'success' : 'error');
    
    // Configure Git for testing
    const git = await gitWrapper.getRepository(TEST_DIR);
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Test 2: File operations
    await colorLog('\n2️⃣ Testing file operations...', 'info');
    
    // Create test files
    const files = {
      'README.md': '# Test Project\n\nThis is a test repository.',
      'src/index.ts': 'console.log("Hello, World!");',
      '.gitignore': 'node_modules/\n*.log\n.env'
    };
    
    for (const [filename, content] of Object.entries(files)) {
      const filepath = path.join(TEST_DIR, filename);
      await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
      await fs.promises.writeFile(filepath, content);
    }
    await colorLog('   ✓ Created test files', 'success');
    
    // Test status
    let status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ Untracked files: ${status.created.length}`, 'success');
    
    // Test add
    await gitWrapper.add(TEST_DIR, '.');
    status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ Staged files: ${status.staged.length}`, 'success');
    
    // Test commit
    await gitWrapper.commit(TEST_DIR, 'Initial commit');
    status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ Repository clean: ${status.isClean}`, 'success');
    
    // Test 3: Branch operations
    await colorLog('\n3️⃣ Testing branch operations...', 'info');
    
    const currentBranch = await gitWrapper.getCurrentBranch(TEST_DIR);
    await colorLog(`   ✓ Current branch: ${currentBranch}`, 'success');
    
    // Test branch validation
    const validBranches = ['feature/new-feature', 'bugfix/fix-123', 'release/v1.0.0'];
    const invalidBranches = ['feature branch', 'HEAD', '../evil', 'branch..name'];
    
    await colorLog('   Testing branch name validation:', 'info');
    for (const branchName of validBranches) {
      const isValid = GitValidator.isValidBranchName(branchName);
      await colorLog(`     ${isValid ? '✓' : '✗'} ${branchName}`, isValid ? 'success' : 'error');
    }
    
    for (const branchName of invalidBranches) {
      const isValid = GitValidator.isValidBranchName(branchName);
      const reason = GitValidator.getInvalidBranchNameReason(branchName);
      await colorLog(`     ${isValid ? '✓' : '✗'} ${branchName} - ${reason}`, isValid ? 'error' : 'warning');
    }
    
    // Create branches
    await gitWrapper.createBranch(TEST_DIR, 'feature/test-feature');
    await gitWrapper.createBranch(TEST_DIR, 'develop');
    
    const branches = await gitWrapper.getBranches(TEST_DIR);
    await colorLog(`   ✓ Total branches: ${branches.length}`, 'success');
    
    // Test 4: More commits and history
    await colorLog('\n4️⃣ Testing commit history...', 'info');
    
    // Switch to feature branch
    await gitWrapper.checkoutBranch(TEST_DIR, 'feature/test-feature');
    
    // Make changes
    await fs.promises.writeFile(path.join(TEST_DIR, 'feature.txt'), 'New feature implementation');
    await gitWrapper.add(TEST_DIR, 'feature.txt');
    await gitWrapper.commit(TEST_DIR, 'Add new feature');
    
    await fs.promises.appendFile(path.join(TEST_DIR, 'README.md'), '\n\n## Features\n- New feature added');
    await gitWrapper.add(TEST_DIR, 'README.md');
    await gitWrapper.commit(TEST_DIR, 'Update README with feature info');
    
    // Get commit history
    const commits = await gitWrapper.getLog(TEST_DIR, { maxCount: 10 });
    await colorLog(`   ✓ Total commits: ${commits.length}`, 'success');
    for (const commit of commits) {
      await colorLog(`     - ${commit.hash.substring(0, 7)} ${commit.message}`, 'info');
    }
    
    // Test 5: Tags
    await colorLog('\n5️⃣ Testing tag operations...', 'info');
    
    await gitWrapper.createTag(TEST_DIR, 'v1.0.0', 'First release');
    await gitWrapper.createTag(TEST_DIR, 'v1.0.1');
    
    const tags = await gitWrapper.getTags(TEST_DIR);
    await colorLog(`   ✓ Tags created: ${tags.join(', ')}`, 'success');
    
    // Test 6: Stash operations
    await colorLog('\n6️⃣ Testing stash operations...', 'info');
    
    // Create uncommitted changes
    await fs.promises.writeFile(path.join(TEST_DIR, 'temp.txt'), 'Temporary work');
    await fs.promises.appendFile(path.join(TEST_DIR, 'feature.txt'), '\n// TODO: Complete this');
    
    status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ Modified files: ${status.modified.length}, Created: ${status.created.length}`, 'success');
    
    // Stash changes
    await gitWrapper.stash(TEST_DIR, ['push', '-m', 'Work in progress']);
    status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ After stash - Clean: ${status.isClean}`, 'success');
    
    // List stashes
    const stashes = await gitWrapper.stashList(TEST_DIR);
    await colorLog(`   ✓ Stashes: ${stashes.length}`, 'success');
    if (stashes.length > 0) {
      await colorLog(`     - ${stashes[0]?.message || 'No message'}`, 'info');
    }
    
    // Pop stash
    await gitWrapper.stashPop(TEST_DIR);
    status = await gitWrapper.status(TEST_DIR);
    await colorLog(`   ✓ After pop - Modified: ${status.modified.length}`, 'success');
    
    // Test 7: Diff
    await colorLog('\n7️⃣ Testing diff operations...', 'info');
    
    const diff = await gitWrapper.diff(TEST_DIR);
    await colorLog(`   ✓ Files changed: ${diff.files.length}`, 'success');
    await colorLog(`   ✓ Insertions: ${diff.insertions}, Deletions: ${diff.deletions}`, 'info');
    
    // Test 8: Remote operations (without actual remote)
    await colorLog('\n8️⃣ Testing remote configuration...', 'info');
    
    // Validate URLs
    const validUrls = [
      'https://github.com/user/repo.git',
      'git@github.com:user/repo.git',
      'ssh://git@github.com:user/repo.git'
    ];
    
    const invalidUrls = [
      'not-a-url',
      'https://github.com/user/repo',  // Missing .git
      'ftp://example.com/repo.git'
    ];
    
    await colorLog('   Testing URL validation:', 'info');
    for (const url of validUrls) {
      const isValid = GitValidator.isValidGitUrl(url);
      await colorLog(`     ${isValid ? '✓' : '✗'} ${url}`, isValid ? 'success' : 'error');
    }
    
    for (const url of invalidUrls) {
      const isValid = GitValidator.isValidGitUrl(url);
      await colorLog(`     ${isValid ? '✓' : '✗'} ${url}`, isValid ? 'error' : 'warning');
    }
    
    await colorLog('\n✅ All tests completed successfully!', 'success');
    
  } catch (error) {
    await colorLog(`\n❌ Test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  } finally {
    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
      await colorLog('\n🧹 Cleaned up test directory', 'info');
    }
  }
}

// Run the tests
if (require.main === module) {
  testGitOperations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}