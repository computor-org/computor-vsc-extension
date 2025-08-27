# Contributing Guide

## Quick Start

```bash
# Clone and setup
git clone https://github.com/computor-org/computor-vsc-extension.git
cd computor-vsc-extension
npm install

# Build and test
npm run compile
npm run test
npm run lint

# Package extension
npm run package
```

## Development Workflow

### Building
- `npm run compile` - Compile TypeScript
- `npm run watch` - Auto-compile on changes
- `npm run lint` - Check code style

### Testing
- `npm run test` - Run unit tests
- `npm run test:integration` - Run integration tests (if available)

### Debugging
1. Open project in VS Code
2. Press `F5` to launch Extension Development Host
3. Test extension in new VS Code window

## Release Process

### CalVer Format
Version: `YYYY.MM.DD[.N]` where N is optional build number for same-day releases.

### Creating a Release

```bash
# First release of the day
npm version 2024.08.27 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 2024.08.27"
git tag v2024.08.27
git push origin main --follow-tags

# Same-day update
npm version 2024.08.27.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 2024.08.27.1"
git tag v2024.08.27.1
git push origin main --follow-tags
```

The GitHub Actions workflow automatically:
1. Builds and tests the extension
2. Creates VSIX package
3. Generates release notes
4. Creates GitHub release with VSIX attachment

### Manual Release

```bash
# Create VSIX locally
npm run package

# Test installation
code --install-extension computor-vsc-extension-*.vsix
```

## Project Structure

```
computor-vsc-extension/
├── src/                 # Source code
│   ├── extension.ts     # Extension entry point
│   ├── commands/        # Command implementations
│   ├── providers/       # Tree data providers
│   ├── services/        # Business logic
│   └── ui/             # UI components
├── test/               # Test files
├── webview-ui/         # Webview assets
├── resources/          # Icons and assets
└── package.json        # Extension manifest
```

## Key Components

### Authentication
- Provider: `ComputorAuthenticationProvider`
- Storage: VS Code SecretStorage API

### Tree Views
- Student: Course content navigation
- Lecturer: Assignment management
- Examples: Code samples

### Services
- `GitService`: Git integration
- `APIService`: Backend communication
- `WorkspaceService`: Workspace management

## Testing Guidelines

### Unit Tests
```typescript
// test/unit/example.test.ts
describe('Feature', () => {
    it('should work', () => {
        // Test implementation
    });
});
```

### Run Specific Tests
```bash
npm run test -- --grep "Feature"
```

## Troubleshooting

### Common Issues

**Build fails**
```bash
npm clean-install
npm run compile
```

**Tests fail with vscode module error**
- Tests require proper VS Code mock setup
- Check `test/setup.ts` and `test/mocks/vscode.js`

**VSIX creation fails**
```bash
npm install -g @vscode/vsce
vsce package --no-yarn
```

## Contributing

1. Create feature branch from `main`
2. Make changes with tests
3. Ensure `npm run lint` passes
4. Create PR with clear description
5. Wait for CI checks and review

## CI/CD

GitHub Actions runs on:
- Push to main
- Pull requests
- Version tags (triggers release)

Workflow: compile → lint → test → package → release

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)