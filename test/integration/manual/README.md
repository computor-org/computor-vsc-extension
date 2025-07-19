# Manual Integration Test Scripts

This directory contains test scripts for testing Git functionality with the GitWrapper implementation.

## Available Test Scripts

### 1. Basic Git Operations Test (`test-git-basic.ts`)

Tests core Git functionality locally without requiring any remote repository:
- Repository initialization
- File operations (add, commit, status)
- Branch operations (create, switch, list)
- Commit history
- Tag operations
- Stash operations
- Diff functionality
- Git validation utilities

**Run with:**
```bash
npm run test:git-basic
```

### 2. GitLab Integration Test (`test-gitlab-integration.ts`)

Tests Git operations with a GitLab instance:
- All basic operations
- Remote repository operations (push, pull)
- Clone operations
- Authentication with GitLab

**Prerequisites:**
- GitLab instance running at `localhost:8084`
- Credentials: `root:ChangeMe123!`
- You need to manually create a repository on GitLab when prompted

**Run with:**
```bash
npm run test:gitlab
```

## GitLab Setup (if needed)

If you need to set up a local GitLab instance:

```bash
# Using Docker
docker run --detach \
  --hostname localhost \
  --publish 8084:80 \
  --publish 2222:22 \
  --name gitlab \
  --restart always \
  --volume gitlab-config:/etc/gitlab \
  --volume gitlab-logs:/var/log/gitlab \
  --volume gitlab-data:/var/opt/gitlab \
  gitlab/gitlab-ce:latest

# Wait for GitLab to start (may take a few minutes)
# Access at http://localhost:8084
# Default root password will be in: docker exec gitlab cat /etc/gitlab/initial_root_password
```

## Test Output

The tests use colored output:
- 🔧 Setup operations
- ✓ Successful tests (green)
- ✗ Failed validations (red/yellow)
- ℹ️ Information (cyan)
- ⚠️ Warnings (yellow)
- ❌ Errors (red)

## Customization

You can modify the test scripts to:
- Test specific Git operations
- Change the test repository structure
- Add more validation tests
- Test with different Git configurations

## Troubleshooting

1. **Permission errors**: Ensure you have write access to the temp directory
2. **Git not found**: Ensure Git is installed and in your PATH
3. **GitLab connection failed**: Check if GitLab is running and accessible
4. **Authentication failed**: Verify the credentials are correct

## Cleanup

Both test scripts automatically clean up their test directories after completion.