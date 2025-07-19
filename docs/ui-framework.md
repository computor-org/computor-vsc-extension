# VS Code UI Framework

## Overview
This document outlines the UI framework architecture for the computor VS Code extension. The framework provides a unified approach to creating custom views, webview panels, and reusable UI components with a consistent design system.

## Architecture Goals

### Design Principles
- **Component-Based**: Reusable UI components with clear interfaces
- **Declarative**: Easy-to-use API for building complex UIs
- **Consistent**: Unified design system across all views
- **Performant**: Efficient rendering and state management
- **Accessible**: WCAG 2.1 compliant components
- **Themeable**: Support for VS Code light/dark themes

### Integration Points
- **VS Code API**: Native integration with VS Code's UI system
- **Webview API**: Custom panels and complex UIs
- **Tree Views**: Hierarchical data display
- **Status Bar**: Quick actions and status indicators
- **Command Palette**: Discoverable commands

## Framework Components

### Base Classes

#### BaseView (Abstract)
```typescript
abstract class BaseView {
  protected context: vscode.ExtensionContext;
  protected disposables: vscode.Disposable[] = [];
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  abstract render(): void;
  abstract dispose(): void;
  
  protected registerDisposable(disposable: vscode.Disposable): void {
    this.disposables.push(disposable);
  }
}
```

#### BaseWebviewPanel
```typescript
abstract class BaseWebviewPanel extends BaseView {
  protected panel: vscode.WebviewPanel;
  protected htmlTemplate: string;
  
  abstract getHtml(): string;
  abstract handleMessage(message: any): void;
  
  protected postMessage(message: any): void;
  protected updateWebview(): void;
}
```

#### BaseTreeDataProvider
```typescript
abstract class BaseTreeDataProvider<T> implements vscode.TreeDataProvider<T> {
  private _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  abstract getTreeItem(element: T): vscode.TreeItem;
  abstract getChildren(element?: T): Thenable<T[]>;
  
  refresh(element?: T): void {
    this._onDidChangeTreeData.fire(element);
  }
}
```

### Component Library

#### Core Components
- **Button**: Primary, secondary, icon buttons
- **Input**: Text, number, password, search inputs
- **Select**: Dropdown selection with search
- **Checkbox**: Boolean input with label
- **Radio**: Single selection from options
- **Toggle**: Switch component
- **Progress**: Linear and circular progress indicators
- **Card**: Container with header, content, actions
- **Modal**: Overlay dialogs and confirmations
- **Tooltip**: Contextual help and information

#### Layout Components
- **Container**: Basic layout wrapper
- **Grid**: CSS Grid-based layout system
- **Flex**: Flexbox layout utilities
- **Sidebar**: Collapsible side panels
- **Header**: Page and section headers
- **Footer**: Page footers with actions
- **Divider**: Visual separation elements
- **Spacer**: Consistent spacing utilities

#### Data Components
- **Table**: Sortable, filterable data tables
- **List**: Virtual scrolling lists
- **Tree**: Hierarchical data display
- **DataGrid**: Advanced data table with editing
- **Chart**: Basic visualization components
- **Timeline**: Event timeline display
- **Badge**: Status and count indicators
- **Tag**: Categorization labels

#### Form Components
- **Form**: Form wrapper with validation
- **FormField**: Labeled input wrapper
- **FormSection**: Grouped form elements
- **Validation**: Error display and validation
- **AutoComplete**: Search with suggestions
- **DatePicker**: Date selection component
- **FileUpload**: File selection and upload
- **RichTextEditor**: Formatted text input

### Styling System

#### CSS Architecture
```
src/ui/
├── styles/
│   ├── base/
│   │   ├── reset.css
│   │   ├── typography.css
│   │   └── variables.css
│   ├── components/
│   │   ├── button.css
│   │   ├── input.css
│   │   └── ...
│   ├── layouts/
│   │   ├── grid.css
│   │   ├── flex.css
│   │   └── containers.css
│   └── themes/
│       ├── light.css
│       ├── dark.css
│       └── high-contrast.css
```

#### Design Tokens
```typescript
interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  spacing: {
    xs: string;    // 4px
    sm: string;    // 8px
    md: string;    // 16px
    lg: string;    // 24px
    xl: string;    // 32px
    xxl: string;   // 48px
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;  // 12px
      sm: string;  // 14px
      md: string;  // 16px
      lg: string;  // 18px
      xl: string;  // 24px
      xxl: string; // 32px
    };
    fontWeight: {
      normal: number;   // 400
      medium: number;   // 500
      semibold: number; // 600
      bold: number;     // 700
    };
    lineHeight: {
      tight: number;   // 1.25
      normal: number;  // 1.5
      relaxed: number; // 1.75
    };
  };
  borderRadius: {
    none: string;   // 0
    sm: string;     // 4px
    md: string;     // 8px
    lg: string;     // 12px
    full: string;   // 9999px
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}
```

#### CSS-in-JS Integration
```typescript
import { css, styled } from 'styled-components';

const Button = styled.button<ButtonProps>`
  ${({ variant, theme }) => css`
    background-color: ${variant === 'primary' 
      ? theme.colors.primary 
      : theme.colors.secondary};
    color: ${theme.colors.text};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    border-radius: ${theme.borderRadius.md};
    font-size: ${theme.typography.fontSize.sm};
    font-weight: ${theme.typography.fontWeight.medium};
    
    &:hover {
      opacity: 0.9;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `}
`;
```

### View Registration System

#### ViewRegistry
```typescript
class ViewRegistry {
  private static instance: ViewRegistry;
  private views = new Map<string, ViewConstructor>();
  private activeViews = new Map<string, BaseView>();
  
  static getInstance(): ViewRegistry {
    if (!ViewRegistry.instance) {
      ViewRegistry.instance = new ViewRegistry();
    }
    return ViewRegistry.instance;
  }
  
  registerView(id: string, constructor: ViewConstructor): void;
  createView(id: string, context: vscode.ExtensionContext): BaseView;
  getActiveView(id: string): BaseView | undefined;
  disposeView(id: string): void;
  disposeAllViews(): void;
}
```

#### View Registration
```typescript
// Register views during extension activation
export function activate(context: vscode.ExtensionContext) {
  const registry = ViewRegistry.getInstance();
  
  // Register view types
  registry.registerView('testResults', TestResultsView);
  registry.registerView('configEditor', ConfigurationEditorView);
  registry.registerView('apiExplorer', ApiExplorerView);
  
  // Create and show views
  const testResultsView = registry.createView('testResults', context);
  testResultsView.render();
}
```

### Component Development

#### Component Interface
```typescript
interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
}

interface Component<T = ComponentProps> {
  props: T;
  render(): JSX.Element;
  dispose?(): void;
}
```

#### Example Component Implementation
```typescript
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className,
  ...props
}) => {
  const theme = useTheme();
  
  const buttonClasses = useMemo(() => {
    return classNames(
      'computor-button',
      `computor-button--${variant}`,
      `computor-button--${size}`,
      {
        'computor-button--disabled': disabled,
      },
      className
    );
  }, [variant, size, disabled, className]);
  
  return (
    <button
      className={buttonClasses}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};
```

### State Management

#### ViewState Interface
```typescript
interface ViewState {
  isLoading: boolean;
  error: string | null;
  data: any;
  filters: Record<string, any>;
  selectedItems: any[];
}

class ViewStateManager<T = any> {
  private state: T;
  private listeners: ((state: T) => void)[] = [];
  
  constructor(initialState: T) {
    this.state = initialState;
  }
  
  getState(): T;
  setState(updates: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
  dispatch(action: Action): void;
}
```

#### Example State Usage
```typescript
class TestResultsView extends BaseWebviewPanel {
  private stateManager = new ViewStateManager({
    tests: [],
    isLoading: false,
    selectedTest: null,
    filters: { status: 'all', search: '' }
  });
  
  constructor(context: vscode.ExtensionContext) {
    super(context);
    
    this.stateManager.subscribe((state) => {
      this.updateWebview();
    });
  }
  
  private async loadTests(): Promise<void> {
    this.stateManager.setState({ isLoading: true });
    
    try {
      const tests = await this.testService.getTests();
      this.stateManager.setState({ 
        tests, 
        isLoading: false 
      });
    } catch (error) {
      this.stateManager.setState({ 
        error: error.message, 
        isLoading: false 
      });
    }
  }
}
```

## Implementation Strategy

### Phase 1: Foundation
- Base view classes and interfaces
- Basic component library (Button, Input, Card)
- Styling system with theme support
- View registration system

### Phase 2: Core Components
- Extended component library
- Form components with validation
- Data display components (Table, List)
- Layout components

### Phase 3: Advanced Features
- State management integration
- Animation and transition system
- Accessibility improvements
- Performance optimizations

### Phase 4: Developer Experience
- Component documentation and Storybook
- Testing utilities
- Development tools and debugging
- Migration guides

## Dependencies

### MIT-Compatible Packages

#### UI and Styling
- **React** (MIT) - Component framework
- **styled-components** (MIT) - CSS-in-JS styling
- **classnames** (MIT) - Conditional class names
- **react-spring** (MIT) - Animation library
- **framer-motion** (MIT) - Advanced animations

#### State Management
- **zustand** (MIT) - Lightweight state management
- **immer** (MIT) - Immutable state updates
- **rxjs** (Apache 2.0) - Reactive programming

#### Utilities
- **lodash** (MIT) - Utility functions
- **date-fns** (MIT) - Date manipulation
- **uuid** (MIT) - UUID generation
- **validator** (MIT) - Input validation

#### Development
- **storybook** (MIT) - Component documentation
- **jest** (MIT) - Testing framework
- **testing-library/react** (MIT) - React testing utilities
- **chromatic** (MIT) - Visual testing

## File Structure

```
src/ui/
├── components/           # Reusable UI components
│   ├── base/            # Base component classes
│   ├── forms/           # Form-related components
│   ├── data/            # Data display components
│   ├── layout/          # Layout components
│   └── feedback/        # Status and feedback components
├── views/               # Main application views
│   ├── TestResultsView/
│   ├── ConfigEditorView/
│   └── ApiExplorerView/
├── styles/              # CSS and styling
│   ├── base/           # Reset, typography, variables
│   ├── components/     # Component-specific styles
│   ├── layouts/        # Layout utilities
│   └── themes/         # Theme definitions
├── hooks/               # Custom React hooks
├── utils/               # UI utility functions
├── types/               # TypeScript type definitions
├── constants/           # UI constants and enums
└── registry/            # View registration system
```

## Testing Strategy

### Component Testing
- Unit tests for all components
- Visual regression testing with Chromatic
- Accessibility testing with axe-core
- Performance testing for complex components

### Integration Testing
- View integration tests
- State management testing
- API integration testing
- E2E testing with VS Code Test Runner

### Manual Testing
- Cross-platform testing (Windows, macOS, Linux)
- Theme compatibility testing
- Accessibility testing with screen readers
- Performance testing in real-world scenarios

## Performance Considerations

### Optimization Strategies
- Virtual scrolling for large datasets
- Code splitting for view components
- Lazy loading of non-critical components
- Efficient re-rendering with React.memo

### Memory Management
- Proper cleanup of event listeners
- Disposal of webview panels
- State cleanup on view destruction
- Resource caching with TTL

### Bundle Size
- Tree shaking for unused components
- Dynamic imports for large components
- CSS optimization and minification
- Asset optimization and compression

## Accessibility

### WCAG 2.1 Compliance
- Keyboard navigation support
- Screen reader compatibility
- High contrast theme support
- Focus management and indicators

### Implementation Guidelines
- Semantic HTML structure
- ARIA labels and descriptions
- Color contrast ratios
- Consistent interaction patterns

## Documentation

### Component Documentation
- Storybook for component showcase
- API documentation with TypeScript
- Usage examples and best practices
- Design guidelines and patterns

### Developer Guide
- Setup and installation instructions
- Component development guidelines
- Styling conventions
- Testing best practices