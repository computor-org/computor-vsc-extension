
# Computor VS Code Extension

## Project Overview
This is a VS Code extension project called "computor-vsc-extension" that is part of a teaching software system.

## Development Guidelines

### Language & Types
- **TypeScript**: Primary development language
- **Strong typing**: Use specific types instead of `any` whenever possible
- **Type safety**: Leverage TypeScript's type system for better code quality

### Git Workflow
- **Small commits**: Keep commit messages concise and focused
- **Ask before committing**: Always confirm before making commits
- **Branch management**: Create GitHub issues for each new branch using `gh` CLI
- **GitHub CLI**: Use `gh` tool for issue and PR management

### Code Quality
- **Use speaking names**: Variables, functions, and classes should clearly express their purpose
- **Let code speak for itself**: Write code as well-written prose that needs no explanation
- **Avoid redundant comments**: Don't comment what the code already says
- **Comment only when required for clarity**: Complex algorithms, workarounds, or non-obvious decisions

### Naming Conventions
- **camelCase**: Variables, functions, methods, and parameters
  - `userName`, `getUserData()`, `handleButtonClick()`
  - Even unused parameters: `element`, `token` (no underscore prefix)
- **PascalCase**: Classes, interfaces, types, enums, and namespaces
  - `HttpClient`, `UserData`, `ButtonVariant`, `ViewState`
- **SCREAMING_SNAKE_CASE**: Constants and enum values
  - `const MAX_RETRY_COUNT = 3`, `ButtonVariant.PRIMARY_BUTTON`
- **kebab-case**: File names, CSS classes, and HTML attributes
  - `user-profile.ts`, `.button-primary`, `data-testid`

### Development Principles
- **SOLID**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **KISS**: Keep It Simple, Stupid - avoid unnecessary complexity
- **YAGNI**: You Aren't Gonna Need It - don't add functionality until it's needed
- **SRP**: Single Responsibility Principle - each class/function should have one reason to change

### Testing
- Write tests for new functionality
- Follow TDD approach when possible
- Ensure code coverage for critical paths