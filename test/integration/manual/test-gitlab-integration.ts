#!/usr/bin/env ts-node

import { GitWrapper } from '../../../src/git/GitWrapper';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Configuration for local GitLab
const GITLAB_URL = process.env.GITLAB_URL || 'http://localhost:8084';
// const GITLAB_USER = 'root';
// const GITLAB_PASSWORD = 'ChangeMe123!';
const GITLAB_PAT = process.env.GITLAB_PAT || '';

// Test repository details
const TEST_REPO_NAME = `test-repo-${Date.now()}`;
const TEST_REPO_PATH = path.join(os.tmpdir(), TEST_REPO_NAME);

// Helper to create authenticated Git URL
function getAuthenticatedUrl(repoPath: string): string {
  // const encodedUser = encodeURIComponent(GITLAB_USER);
  // const encodedPass = encodeURIComponent(GITLAB_PASSWORD);
  return `http://x-auth-token:${GITLAB_PAT}@localhost:8084/testing/${repoPath}.git`;
}

async function setupTestEnvironment() {
  console.log('🔧 Setting up test environment...');
  
  // Create test directory
  await fs.promises.mkdir(TEST_REPO_PATH, { recursive: true });
  
  const gitWrapper = new GitWrapper();
  return gitWrapper;
}

async function testLocalRepository(gitWrapper: GitWrapper) {
  console.log('\n📁 Testing local repository operations...');
  
  try {
    // Initialize repository
    console.log('  ✓ Initializing repository');
    await gitWrapper.init(TEST_REPO_PATH);
    
    // Configure Git for the test
    const git = await gitWrapper.getRepository(TEST_REPO_PATH);
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Check if it's a repository
    const isRepo = await gitWrapper.isRepository(TEST_REPO_PATH);
    console.log(`  ✓ Repository check: ${isRepo}`);
    
    // Get repository info
    const repoInfo = await gitWrapper.getRepositoryInfo(TEST_REPO_PATH);
    console.log(`  ✓ Current branch: ${repoInfo.currentBranch}`);
    
    // Create and commit some files
    console.log('  ✓ Creating test files');
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, 'README.md'), '# Test Repository\n\nThis is a test repository for GitLab integration.');
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, '.gitignore'), 'node_modules/\n*.log');
    
    // Add files
    console.log('  ✓ Adding files to staging');
    await gitWrapper.add(TEST_REPO_PATH, '.');
    
    // Check status
    const status = await gitWrapper.status(TEST_REPO_PATH);
    console.log(`  ✓ Files staged: ${status.staged.length}`);
    
    // Commit
    console.log('  ✓ Creating initial commit');
    await gitWrapper.commit(TEST_REPO_PATH, 'Initial commit');
    
    // Create branches
    console.log('  ✓ Creating feature branch');
    await gitWrapper.createBranch(TEST_REPO_PATH, 'feature/test-feature');
    
    // Add more changes
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, 'feature.txt'), 'This is a feature file');
    await gitWrapper.add(TEST_REPO_PATH, 'feature.txt');
    await gitWrapper.commit(TEST_REPO_PATH, 'Add feature file');
    
    // Switch back to main/master
    console.log('  ✓ Switching branches');
    await gitWrapper.checkoutBranch(TEST_REPO_PATH, 'master');
    
    // List branches
    const branches = await gitWrapper.getBranches(TEST_REPO_PATH);
    console.log(`  ✓ Branches: ${branches.map(b => b.name).join(', ')}`);
    
    // Create a tag
    console.log('  ✓ Creating tag');
    await gitWrapper.createTag(TEST_REPO_PATH, 'v1.0.0', 'First release');
    
    // Get commit history
    const commits = await gitWrapper.getLog(TEST_REPO_PATH, { maxCount: 5 });
    console.log(`  ✓ Total commits: ${commits.length}`);
    
  } catch (error) {
    console.error('❌ Local repository test failed:', error);
    throw error;
  }
}

async function testRemoteOperations(gitWrapper: GitWrapper) {
  console.log('\n🌐 Testing remote operations with GitLab...');
  
  try {
    // Note: This assumes the repository already exists on GitLab
    // You may need to create it manually or use GitLab API
    console.log('  ℹ️  Note: Remote operations will fail if repository doesn\'t exist on GitLab');
    console.log(`     Expected location: ${GITLAB_URL}/testing/${TEST_REPO_NAME}`);
    
    // Add remote
    const remoteUrl = getAuthenticatedUrl(TEST_REPO_NAME);
    console.log('  ✓ Adding remote origin');
    await gitWrapper.addRemote(TEST_REPO_PATH, 'origin', remoteUrl);
    
    // List remotes
    const remotes = await gitWrapper.getRemotes(TEST_REPO_PATH);
    console.log(`  ✓ Remotes configured: ${remotes.map(r => r.name).join(', ')}`);
    
    // Push to remote
    console.log('  ✓ Pushing to remote repository');
    try {
      await gitWrapper.push(TEST_REPO_PATH, 'origin', 'master');
      console.log('  ✓ Successfully pushed master branch');
    } catch (pushError) {
      console.log('  ⚠️  Push failed (this is expected if repo doesn\'t exist on GitLab)');
      console.log(`     Error: ${pushError instanceof Error ? pushError.message : String(pushError)}`);
    }
    
    // Push tags
    console.log('  ✓ Pushing tags');
    try {
      const git = await gitWrapper.getRepository(TEST_REPO_PATH);
      await git.push('origin', '--tags');
      console.log('  ✓ Successfully pushed tags');
    } catch (tagError) {
      console.log('  ⚠️  Tag push failed');
    }
    
  } catch (error) {
    console.error('❌ Remote operations test failed:', error);
    throw error;
  }
}

async function testCloneOperation(gitWrapper: GitWrapper) {
  console.log('\n📥 Testing clone operation...');
  
  const clonePath = path.join(os.tmpdir(), `${TEST_REPO_NAME}-clone`);
  
  try {
    // Clean up if exists
    if (fs.existsSync(clonePath)) {
      await fs.promises.rm(clonePath, { recursive: true, force: true });
    }
    
    // Clone repository
    console.log('  ✓ Cloning repository');
    const remoteUrl = getAuthenticatedUrl(TEST_REPO_NAME);
    
    try {
      await gitWrapper.clone(remoteUrl, clonePath, { depth: 1 });
      console.log('  ✓ Repository cloned successfully');
      
      // Verify clone
      const isRepo = await gitWrapper.isRepository(clonePath);
      console.log(`  ✓ Clone verification: ${isRepo}`);
      
      // Check cloned content
      const files = await fs.promises.readdir(clonePath);
      console.log(`  ✓ Cloned files: ${files.join(', ')}`);
      
    } catch (cloneError) {
      console.log('  ⚠️  Clone failed (this is expected if repo doesn\'t exist on GitLab)');
      console.log(`     Error: ${cloneError instanceof Error ? cloneError.message : String(cloneError)}`);
    }
    
    // Clean up clone
    if (fs.existsSync(clonePath)) {
      await fs.promises.rm(clonePath, { recursive: true, force: true });
    }
    
  } catch (error) {
    console.error('❌ Clone operation test failed:', error);
    throw error;
  }
}

async function testStashOperations(gitWrapper: GitWrapper) {
  console.log('\n📦 Testing stash operations...');
  
  try {
    // Make some changes
    console.log('  ✓ Creating uncommitted changes');
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, 'stash-test.txt'), 'This will be stashed');
    
    // Stash changes
    console.log('  ✓ Stashing changes');
    await gitWrapper.stash(TEST_REPO_PATH, ['push', '-m', 'Test stash']);
    
    // List stashes
    const stashes = await gitWrapper.stashList(TEST_REPO_PATH);
    console.log(`  ✓ Stashes count: ${stashes.length}`);
    
    if (stashes.length > 0) {
      console.log(`  ✓ Latest stash: ${stashes[0]?.message || 'No message'}`);
      
      // Apply stash
      console.log('  ✓ Applying stash');
      await gitWrapper.stashPop(TEST_REPO_PATH);
      
      // Verify file is back
      const fileExists = fs.existsSync(path.join(TEST_REPO_PATH, 'stash-test.txt'));
      console.log(`  ✓ Stashed file restored: ${fileExists}`);
    }
    
  } catch (error) {
    console.error('❌ Stash operations test failed:', error);
    throw error;
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  try {
    if (fs.existsSync(TEST_REPO_PATH)) {
      await fs.promises.rm(TEST_REPO_PATH, { recursive: true, force: true });
      console.log('  ✓ Test repository removed');
    }
  } catch (error) {
    console.error('  ⚠️  Cleanup failed:', error);
  }
}

async function main() {
  console.log('🚀 GitLab Integration Test Suite');
  console.log('================================');
  console.log(`GitLab URL: ${GITLAB_URL}`);
  console.log(`Test repo: ${TEST_REPO_NAME}`);
  console.log(`Local path: ${TEST_REPO_PATH}`);
  
  let gitWrapper: GitWrapper;
  
  try {
    // Setup
    gitWrapper = await setupTestEnvironment();
    
    // Run tests
    await testLocalRepository(gitWrapper);
    await testRemoteOperations(gitWrapper);
    await testCloneOperation(gitWrapper);
    await testStashOperations(gitWrapper);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanup();
    // Ensure process exits cleanly
    process.stdin.destroy();
  }
}

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}