# Computor VS Code Extension

VS Code extension for the Computor teaching software system.

## Installation

### Latest Release (Direct from GitHub)

```bash
# Download and install latest release
curl -L https://github.com/computor-org/computor-vsc-extension/releases/latest/download/computor-vsc-extension-*.vsix -o computor.vsix
code --install-extension computor.vsix
```

### Specific Version

```bash
# Install specific version (e.g., 2024.08.27)
curl -L https://github.com/computor-org/computor-vsc-extension/releases/download/v2024.08.27/computor-vsc-extension-2024.08.27.vsix -o computor.vsix
code --install-extension computor.vsix
```

### Manual Installation

1. Download VSIX from [Releases](https://github.com/computor-org/computor-vsc-extension/releases)
2. Run: `code --install-extension downloaded-file.vsix`

## Features

- **Multi-Role Support**: Lecturer, student, and tutor views
- **Course Management**: Content creation and distribution
- **Assignment Workflow**: Distribution, submission, and review
- **Git Integration**: Built-in repository operations
- **Example Repository**: Code example management
- **Authentication**: Secure backend integration

## Usage

1. Open VS Code
2. Sign in via Command Palette (`Ctrl+Shift+P`): `Computor: Sign In`
3. Select workspace directory: `Computor: Select Workspace`
4. Access role-specific features in the Activity Bar

## Development

See [Developer Guide](docs/DEVELOPER.md) for build instructions, architecture, and contribution guidelines.

### Quick Start

```bash
git clone https://github.com/computor-org/computor-vsc-extension.git
cd computor-vsc-extension
npm install
npm run compile
# Press F5 in VS Code to test
```

## Requirements

- VS Code 1.74.0 or later
- Git installed and configured
- Internet connection for backend services

## Support

- [Report Issues](https://github.com/computor-org/computor-vsc-extension/issues)
- [Documentation](docs/)
- [Releases](https://github.com/computor-org/computor-vsc-extension/releases)

## License

MIT - See [LICENSE](LICENSE) for details.