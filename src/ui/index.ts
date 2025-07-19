// Main entry point for the UI framework

// Base classes
export { BaseView } from './base/BaseView';
export { BaseWebviewPanel } from './base/BaseWebviewPanel';
export { BaseTreeDataProvider } from './base/BaseTreeDataProvider';

// Components
export * from './components';

// Types
export * from './types';

// Registry
export { ViewRegistry, viewRegistry } from './registry/ViewRegistry';

// State management
export { ViewStateManager, createViewState } from './state/ViewStateManager';

// Styles
export { designTokens } from './styles/tokens';