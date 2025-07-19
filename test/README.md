# Test Directory Structure

This directory contains all tests for the Computor VS Code Extension.

## Structure

```
test/
├── authentication/       # Unit tests for authentication module
├── git/                 # Unit tests for Git wrapper and utilities
├── helpers/             # Test helpers and mocks
├── http/                # Unit tests for HTTP clients
│   └── cache/          # Cache strategy tests
├── integration/         # Integration tests
│   ├── git/            # Automated Git integration tests (Jest)
│   └── manual/         # Manual integration test scripts
├── settings/           # Unit tests for settings management
└── utils/              # Unit tests for utilities
```

## Test Frameworks

- **Unit Tests**: Mocha + Chai
- **Integration Tests**: Jest
- **Manual Tests**: Node.js scripts with ts-node

## Running Tests

### Unit Tests
```bash
npm test              # Run all Mocha tests
npm run test:unit     # Run unit tests without VS Code dependencies
```

### Integration Tests
```bash
npm run test:integration  # Run Jest integration tests
```

### Manual Integration Tests
```bash
npm run test:git-basic    # Test basic Git operations
npm run test:gitlab       # Test GitLab integration (interactive)
npm run test:gitlab-auto  # Test GitLab integration (automated)
```

### All Tests
```bash
npm run test:all  # Run all unit and integration tests
```

## Environment Variables

For GitLab integration tests:
- `GITLAB_URL`: GitLab instance URL (default: http://localhost:8084)
- `GITLAB_USER`: GitLab username (default: root)
- `GITLAB_PAT`: GitLab personal access token (required for remote operations)

Example:
```bash
GITLAB_PAT=your-token npm run test:gitlab-auto
```

## Test Guidelines

1. **Unit Tests**: Should be fast, isolated, and not require external dependencies
2. **Integration Tests**: Can interact with file system and Git repositories
3. **Manual Tests**: For testing with external services like GitLab

## Adding New Tests

- Place unit tests next to the module they test
- Add integration tests to `test/integration/`
- Create manual test scripts in `test/integration/manual/`