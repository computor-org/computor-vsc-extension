# Tree Data Provider

## Overview
This document outlines the tree data provider architecture for the computor VS Code extension. The extension uses VS Code's TreeDataProvider interface to display hierarchical data in tree views.

## Implementation Status
✅ **Completed** - All tree data providers have been implemented and are ready for use.

## Use Cases

### 1. API-Based Tree Data
- Display data fetched from FastAPI backend
- Dynamic loading of tree nodes
- Real-time updates from API responses

### 2. JSON Data Visualization
- Display test results in hierarchical format
- Show configuration data as tree structures
- Visualize nested JSON objects

## Architecture

### Abstract Base Classes

#### BaseTreeDataProvider
**Note: This class extends VS Code's built-in `vscode.TreeDataProvider<T>` interface**

```typescript
abstract class BaseTreeDataProvider<T extends BaseTreeItem> implements vscode.TreeDataProvider<T> {
  protected _onDidChangeTreeData: vscode.EventEmitter<T | undefined | null | void> = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<T | undefined | null | void> = this._onDidChangeTreeData.event;

  abstract getTreeItem(element: T): vscode.TreeItem;
  abstract getChildren(element?: T): Thenable<T[]>;
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  protected abstract loadData(element?: T): Promise<T[]>;
}
```

#### BaseTreeItem
**Note: This class extends VS Code's built-in `vscode.TreeItem` class**

```typescript
abstract class BaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: any
  ) {
    super(label, collapsibleState);
  }
  
  abstract getChildren(): Promise<BaseTreeItem[]>;
  abstract getContextValue(): string;
}
```

### Concrete Implementations

#### ApiTreeDataProvider
```typescript
class ApiTreeDataProvider extends BaseTreeDataProvider<ApiTreeItem> {
  constructor(private httpClient: HttpClient, private apiEndpoint: string) {
    super();
  }
  
  getTreeItem(element: ApiTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: ApiTreeItem): Promise<ApiTreeItem[]> {
    if (!element) {
      return this.loadRootItems();
    }
    return element.getChildren();
  }
  
  protected async loadData(element?: ApiTreeItem): Promise<ApiTreeItem[]> {
    const response = await this.httpClient.get(this.apiEndpoint);
    return this.mapResponseToTreeItems(response.data);
  }
  
  private mapResponseToTreeItems(data: any[]): ApiTreeItem[] {
    // Implementation specific to API response structure
  }
}
```

#### JsonTreeDataProvider
```typescript
class JsonTreeDataProvider extends BaseTreeDataProvider<JsonTreeItem> {
  constructor(private jsonData: any) {
    super();
  }
  
  getTreeItem(element: JsonTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: JsonTreeItem): Promise<JsonTreeItem[]> {
    if (!element) {
      return this.createTreeFromJson(this.jsonData);
    }
    return element.getChildren();
  }
  
  protected async loadData(element?: JsonTreeItem): Promise<JsonTreeItem[]> {
    return this.createTreeFromJson(this.jsonData);
  }
  
  private createTreeFromJson(obj: any, parentKey?: string): JsonTreeItem[] {
    // Implementation for converting JSON to tree structure
  }
}
```

#### TestResultTreeDataProvider
```typescript
class TestResultTreeDataProvider extends JsonTreeDataProvider {
  constructor(testResults: TestResult[]) {
    super(testResults);
  }
  
  protected mapTestResultsToTree(results: TestResult[]): JsonTreeItem[] {
    // Group tests by suite/file
    // Create hierarchical structure
    // Show pass/fail status with icons
  }
}
```

### Tree Item Types

#### ApiTreeItem
```typescript
class ApiTreeItem extends BaseTreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly apiData: any,
    public readonly childEndpoint?: string
  ) {
    super(label, collapsibleState, apiData);
  }
  
  async getChildren(): Promise<ApiTreeItem[]> {
    if (this.childEndpoint) {
      // Load children from API
    }
    return [];
  }
  
  getContextValue(): string {
    return 'apiTreeItem';
  }
}
```

#### JsonTreeItem
```typescript
class JsonTreeItem extends BaseTreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly jsonValue: any,
    public readonly path: string[]
  ) {
    super(label, collapsibleState, jsonValue);
    this.setIcon();
  }
  
  async getChildren(): Promise<JsonTreeItem[]> {
    if (typeof this.jsonValue === 'object' && this.jsonValue !== null) {
      return Object.entries(this.jsonValue).map(([key, value]) => 
        new JsonTreeItem(
          `${key}: ${this.getValuePreview(value)}`,
          this.getCollapsibleState(value),
          value,
          [...this.path, key]
        )
      );
    }
    return [];
  }
  
  getContextValue(): string {
    return `jsonTreeItem.${typeof this.jsonValue}`;
  }
  
  private setIcon(): void {
    // Set appropriate icon based on value type
  }
}
```

## Data Flow

### API-Based Tree
1. User expands tree node
2. TreeDataProvider.getChildren() called
3. HTTP request made to backend API
4. Response mapped to TreeItem objects
5. Tree updated with new items

### JSON Tree
1. JSON data provided to TreeDataProvider
2. Data parsed and converted to tree structure
3. Tree items created with appropriate icons and labels
4. Hierarchical structure maintained

## Features

### Dynamic Loading
- Lazy loading of tree nodes
- Pagination support for large datasets
- Caching mechanisms for performance
- Error handling for failed requests

### Visual Indicators
- Icons for different data types
- Status indicators (success/failure for tests)
- Progress indicators for loading states
- Badges for counts and metadata

### Interaction
- Context menus for tree items
- Click actions for navigation
- Copy/export functionality
- Refresh capabilities

## Configuration

### Tree View Registration
**Note: Use VS Code's built-in tree view registration in `package.json` contributions**

```typescript
interface TreeViewConfig {
  id: string;
  name: string;
  when?: string;
  canSelectMany?: boolean;
  canDragAndDrop?: boolean;
  showCollapseAll?: boolean;
}

// Register tree views in package.json:
// "contributes": {
//   "views": {
//     "explorer": [
//       {
//         "id": "computor.apiTreeView",
//         "name": "Computor API",
//         "when": "computor.authenticated"
//       }
//     ]
//   }
// }
```

### Provider Configuration
```typescript
interface TreeProviderConfig {
  refreshInterval?: number;
  maxDepth?: number;
  cacheTimeout?: number;
  batchSize?: number;
}
```

## Error Handling

### API Errors
- Network connectivity issues
- Authentication failures
- Server errors
- Invalid response formats

### JSON Parsing Errors
- Malformed JSON data
- Circular references
- Large data sets
- Type conversion issues

## Testing Strategy

### Unit Tests
- Test tree item creation
- Test data mapping logic
- Test error handling
- Mock API responses

### Integration Tests
- Test with real API endpoints
- Test tree refresh functionality
- Test user interactions
- Test performance with large datasets

### UI Tests
- Test tree rendering
- Test expand/collapse behavior
- Test context menus
- Test visual indicators

## Performance Considerations

### Optimization
- Implement virtual scrolling for large trees
- Use pagination for API requests
- Cache frequently accessed data
- Debounce refresh operations

### Memory Management
- Dispose of event listeners
- Clear cached data when appropriate
- Limit tree depth for complex structures
- Use weak references where possible

## Implementation Summary

### Completed Components

1. **Type Definitions** (`src/types/TreeTypes.ts`)
   - Comprehensive type definitions for all tree components
   - Icons, enums, and interfaces for tree data structures

2. **Base Classes**
   - `BaseTreeItem`: Abstract class with caching, navigation, and utility methods
   - `BaseTreeDataProvider`: Enhanced with auto-refresh, statistics, and advanced features

3. **Tree Item Implementations**
   - `ApiTreeItem`: Supports pagination, lazy loading, and error handling
   - `JsonTreeItem`: Full JSON visualization with search and filtering

4. **Tree Data Providers**
   - `ApiTreeDataProvider`: Complete API integration with dynamic loading
   - `JsonTreeDataProvider`: JSON exploration with search capabilities
   - `TestResultTreeDataProvider`: Specialized for test results with grouping and export

5. **VS Code Integration**
   - Tree views registered in package.json
   - Commands for all tree operations
   - Context menus for item-specific actions
   - Title bar actions for tree-wide operations

### Usage Example

See `src/ui/tree/examples/treeProviderExample.ts` for comprehensive usage examples.

### Next Steps

1. Create unit tests for all tree components
2. Add integration tests with mock data
3. Integrate with actual API endpoints
4. Add user preferences for tree behavior