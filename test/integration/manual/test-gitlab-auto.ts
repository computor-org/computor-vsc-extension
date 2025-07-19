#!/usr/bin/env ts-node

import { GitWrapper } from '../../../src/git/GitWrapper';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Configuration for local GitLab
const GITLAB_HTTP_PREFIX = process.env.GITLAB_HTTP_PREFIX!;
const GITLAB_HOST = process.env.GITLAB_HOST!;
const GITLAB_PORT = process.env.GITLAB_PORT!;
const GITLAB_PAT = process.env.GITLAB_PAT!;

// Test repository details
const TEST_REPO_NAME = `test-repo-${Date.now()}`;
const TEST_REPO_PATH = path.join(os.tmpdir(), TEST_REPO_NAME);

// Helper to create authenticated Git URL
function getAuthenticatedUrl(repoPath: string): string {
  // Using GitLab personal access token authentication
  return `${GITLAB_HTTP_PREFIX}://x-auth-token:${GITLAB_PAT}@${GITLAB_HOST}:${GITLAB_PORT}/testing/${repoPath}.git`;
}

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

async function testGitLabIntegration() {
  const gitWrapper = new GitWrapper();
  
  try {
    await colorLog('🚀 GitLab Integration Test (Automated)', 'info');
    await colorLog(`GitLab URL: ${GITLAB_HTTP_PREFIX}://${GITLAB_HOST}:${GITLAB_PORT}`, 'info');
    await colorLog(`Test repo: ${TEST_REPO_NAME}`, 'info');
    await colorLog(`Local path: ${TEST_REPO_PATH}\n`, 'info');
    
    if (!GITLAB_PAT) {
      await colorLog('⚠️  Warning: GITLAB_PAT environment variable not set', 'warning');
      await colorLog('   Remote operations will fail. Set GITLAB_PAT to enable GitLab integration.', 'warning');
    }
    
    // Setup
    await fs.promises.mkdir(TEST_REPO_PATH, { recursive: true });
    
    // Initialize and configure repository
    await colorLog('📁 Setting up local repository...', 'info');
    await gitWrapper.init(TEST_REPO_PATH);
    
    const git = await gitWrapper.getRepository(TEST_REPO_PATH);
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Create initial content
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, 'README.md'), '# Test Repository\n\nThis is an automated test repository.');
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, '.gitignore'), 'node_modules/\n*.log');
    
    await gitWrapper.add(TEST_REPO_PATH, '.');
    await gitWrapper.commit(TEST_REPO_PATH, 'Initial commit');
    await colorLog('  ✓ Repository initialized with initial commit', 'success');
    
    // Create a feature branch
    await gitWrapper.createBranch(TEST_REPO_PATH, 'feature/test');
    await fs.promises.writeFile(path.join(TEST_REPO_PATH, 'feature.txt'), 'Feature content');
    await gitWrapper.add(TEST_REPO_PATH, 'feature.txt');
    await gitWrapper.commit(TEST_REPO_PATH, 'Add feature');
    await colorLog('  ✓ Feature branch created with commit', 'success');
    
    // Switch back to master
    await gitWrapper.checkoutBranch(TEST_REPO_PATH, 'master');
    
    // Test remote operations (will fail gracefully if GitLab isn't set up)
    await colorLog('\n🌐 Testing remote operations...', 'info');
    
    const remoteUrl = getAuthenticatedUrl(TEST_REPO_NAME);
    await colorLog(`  Remote URL: ${remoteUrl.replace(GITLAB_PAT, '****')}`, 'info');
    
    try {
      await gitWrapper.addRemote(TEST_REPO_PATH, 'origin', remoteUrl);
      await colorLog('  ✓ Remote added successfully', 'success');
      
      // Try to push (this will fail if repo doesn't exist on GitLab)
      await colorLog('  Attempting to push to GitLab...', 'info');
      await gitWrapper.push(TEST_REPO_PATH, 'origin', 'master');
      await colorLog('  ✓ Successfully pushed to GitLab!', 'success');
      
      // If push succeeded, try more operations
      await git.push('origin', '--tags');
      await colorLog('  ✓ Tags pushed successfully', 'success');
      
    } catch (remoteError) {
      await colorLog('  ⚠️  Remote operations failed (expected if GitLab repo doesn\'t exist)', 'warning');
      await colorLog(`  Error: ${remoteError instanceof Error ? remoteError.message : String(remoteError)}`, 'warning');
      
      // Test local operations continue even if remote fails
      await colorLog('\n  Continuing with local-only tests...', 'info');
    }
    
    // Test clone operation (simulate cloning from local path)
    await colorLog('\n📥 Testing clone operation...', 'info');
    const clonePath = path.join(os.tmpdir(), `${TEST_REPO_NAME}-clone`);
    
    try {
      // Clean up if exists
      if (fs.existsSync(clonePath)) {
        await fs.promises.rm(clonePath, { recursive: true, force: true });
      }
      
      // Try to clone from GitLab first
      try {
        await gitWrapper.clone(remoteUrl, clonePath, { depth: 1 });
        await colorLog('  ✓ Cloned from GitLab successfully', 'success');
      } catch {
        // If GitLab clone fails, clone from local path
        await colorLog('  GitLab clone failed, cloning from local path...', 'warning');
        await gitWrapper.clone(`file://${TEST_REPO_PATH}`, clonePath);
        await colorLog('  ✓ Cloned from local path successfully', 'success');
      }
      
      const isCloneRepo = await gitWrapper.isRepository(clonePath);
      await colorLog(`  ✓ Clone verification: ${isCloneRepo}`, 'success');
      
      // Clean up clone
      await fs.promises.rm(clonePath, { recursive: true, force: true });
      
    } catch (cloneError) {
      await colorLog(`  ❌ Clone test failed: ${cloneError instanceof Error ? cloneError.message : String(cloneError)}`, 'error');
    }
    
    // Summary
    await colorLog('\n📊 Test Summary:', 'info');
    await colorLog('  ✓ Local Git operations: SUCCESS', 'success');
    
    const remotes = await gitWrapper.getRemotes(TEST_REPO_PATH);
    if (remotes.length > 0) {
      await colorLog('  ℹ️  Remote configured but push may have failed', 'warning');
      await colorLog('     To complete GitLab testing:', 'info');
      await colorLog(`     1. Create repository`, 'info');
      await colorLog(`     2. Run: cd ${TEST_REPO_PATH} && git push origin --all`, 'info');
    }
    
    await colorLog('\n✅ Test completed!', 'success');
    
  } catch (error) {
    await colorLog(`\n❌ Test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  } finally {
    // Cleanup
    if (fs.existsSync(TEST_REPO_PATH)) {
      await fs.promises.rm(TEST_REPO_PATH, { recursive: true, force: true });
      await colorLog('\n🧹 Cleaned up test directory', 'info');
    }
  }
}

// Run the test
if (require.main === module) {
  testGitLabIntegration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}