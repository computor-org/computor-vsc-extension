# Computor VS Code Extension

A VS Code extension for the Computor teaching software system, providing integrated tools for lecturers, students, and tutors in programming education.

## Features

- **Multi-Role Support**: Dedicated views and functionality for lecturers, students, and tutors
- **Course Management**: Comprehensive course content creation and management tools
- **Assignment Workflow**: Streamlined assignment distribution, submission, and review process
- **Git Integration**: Built-in Git operations for course repositories and student submissions
- **Example Repository**: Workbench for managing and distributing code examples
- **Authentication**: Secure authentication with the Computor backend system

## Installation

### From VSIX Package (Recommended)

1. Download the latest VSIX package from the [Releases](https://github.com/your-repo/computor-vsc-extension/releases) page
2. Open VS Code
3. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
4. Click the three dots menu (`...`) and select "Install from VSIX..."
5. Choose the downloaded VSIX file
6. Restart VS Code when prompted

### From Source (Development)

```bash
git clone https://github.com/your-repo/computor-vsc-extension.git
cd computor-vsc-extension
npm install
npm run compile
```

## Development

### Prerequisites

- Node.js 18.x or later
- npm 8.x or later
- VS Code 1.74.0 or later

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Compile the extension: `npm run compile`
4. Run tests: `npm run test`

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and auto-compile |
| `npm run lint` | Run ESLint code linting |
| `npm run test` | Run unit tests |
| `npm run test:all` | Run all tests (unit + integration) |
| `npm run package` | Create VSIX package |
| `npm run release:prepare` | Prepare release (compile, lint, test, package) |
| `npm run release` | Full release process with git tagging |

## Release Process

The extension uses an automated release workflow powered by GitHub Actions. Releases are triggered automatically when version tags are pushed to the repository.

### Automated Release Workflow

#### How It Works

1. **Version Update**: Update the version in `package.json` using semantic versioning
2. **Tag Creation**: Create and push a version tag (format: `v*.*.*`)
3. **Automated Build**: GitHub Actions automatically builds and packages the extension
4. **Release Creation**: A GitHub release is created with the VSIX file as an asset

#### Creating a Release

```bash
# Option 1: Manual process
npm version patch  # or minor, major, prerelease
git push origin main --follow-tags

# Option 2: Using release script
npm run release
```

#### Version Tag Format

- **Stable releases**: `v1.0.0`, `v1.2.3`
- **Pre-releases**: `v1.0.0-alpha`, `v2.1.0-beta.1`, `v1.5.0-rc.2`

#### Release Types

| Command | Version Change | Example |
|---------|----------------|---------|
| `npm version patch` | Bug fixes | 1.0.0 → 1.0.1 |
| `npm version minor` | New features | 1.0.1 → 1.1.0 |
| `npm version major` | Breaking changes | 1.1.0 → 2.0.0 |
| `npm version prerelease` | Pre-release | 1.1.0 → 1.1.1-0 |

### Manual Release (Local Development)

For testing or development purposes, you can create VSIX packages locally:

```bash
# Create a VSIX package
npm run package

# Create a VSIX package with version in filename
npm run package:version

# Full local release preparation
npm run release:prepare
```

### Release Validation

The automated workflow includes comprehensive validation:

- **Code Quality**: ESLint validation and TypeScript compilation
- **Testing**: Full unit test suite execution
- **Version Validation**: Ensures git tag matches package.json version
- **Package Integrity**: Validates VSIX structure and required files
- **Release Notes**: Automatically generates changelog from commit history

### Rollback Procedures

If a release fails or needs to be rolled back:

1. **Delete the problematic tag**:
   ```bash
   git tag -d v1.0.0
   git push origin --delete v1.0.0
   ```

2. **Delete the GitHub release** (if created)
3. **Fix the issues** in the codebase
4. **Create a new patch release**:
   ```bash
   npm version patch
   git push origin main --follow-tags
   ```

### Repository Secrets Configuration

The release workflow requires the following repository secrets:

| Secret | Description | Required |
|--------|-------------|----------|
| `GITHUB_TOKEN` | Automatic GitHub token | ✅ (Auto-configured) |
| `VSCE_PAT` | Visual Studio Marketplace Personal Access Token | ⚠️ (Future enhancement) |

#### Setting up Repository Secrets

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add the required secrets

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions and doesn't need manual configuration.

### Troubleshooting Releases

#### Common Issues

**1. Version Tag Mismatch**
```
Error: Tag version (1.0.1) does not match package.json version (1.0.0)
```
**Solution**: Ensure the git tag exactly matches the version in package.json

**2. VSIX Package Validation Failed**
```
Error: extension.js not found in VSIX package
```
**Solution**: Run `npm run compile` before creating the package

**3. Release Workflow Not Triggered**
```
Workflow doesn't run when tag is pushed
```
**Solution**: Verify tag format matches `v*.*.*` pattern (e.g., `v1.0.0`, not `1.0.0`)

#### Workflow Logs

To debug release issues:

1. Go to the Actions tab in your repository
2. Find the failed workflow run
3. Expand the failed step to view detailed logs
4. Look for error messages and stack traces

### Testing the Release Process

To test the release workflow without creating a production release:

1. **Create a test tag**:
   ```bash
   git tag v0.0.1-test
   git push origin v0.0.1-test
   ```

2. **Monitor the workflow** in the Actions tab
3. **Verify the release** is created with pre-release flag
4. **Clean up** by deleting the test tag and release

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run test:all`
5. Commit your changes: `git commit -m 'feat: add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a pull request

### Code Quality Standards

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Use conventional commit messages
- Ensure ESLint passes without warnings
- Add documentation for public APIs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.