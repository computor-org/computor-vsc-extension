import * as vscode from 'vscode';

/**
 * Configuration for tree data providers
 */
export interface TreeProviderConfig {
  refreshInterval?: number;
  maxDepth?: number;
  cacheTimeout?: number;
  batchSize?: number;
  showIcons?: boolean;
  expandAll?: boolean;
}

/**
 * Configuration for tree view registration
 */
export interface TreeViewConfig {
  id: string;
  name: string;
  when?: string;
  canSelectMany?: boolean;
  canDragAndDrop?: boolean;
  showCollapseAll?: boolean;
}

/**
 * Base data structure for tree items
 */
export interface TreeItemData {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | string;
  contextValue?: string;
  command?: vscode.Command;
  resourceUri?: vscode.Uri;
  metadata?: Record<string, any>;
}

/**
 * API response structure for tree data
 */
export interface ApiTreeData {
  id: string;
  name: string;
  type: string;
  children?: ApiTreeData[];
  hasMore?: boolean;
  nextPage?: string;
  metadata?: Record<string, any>;
}

/**
 * Test result structure for tree display
 */
export interface TestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  error?: string;
  file?: string;
  suite?: string;
  children?: TestResult[];
}

/**
 * JSON value types for tree display
 */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

/**
 * Tree item type enumeration
 */
export enum TreeItemType {
  API = 'api',
  JSON = 'json',
  TEST = 'test',
  FOLDER = 'folder',
  FILE = 'file',
  VALUE = 'value',
  ARRAY = 'array',
  OBJECT = 'object',
  ERROR = 'error',
  LOADING = 'loading'
}

/**
 * Icon mapping for different tree item types
 */
export const TreeItemIcons: Record<TreeItemType, vscode.ThemeIcon> = {
  [TreeItemType.API]: new vscode.ThemeIcon('globe'),
  [TreeItemType.JSON]: new vscode.ThemeIcon('json'),
  [TreeItemType.TEST]: new vscode.ThemeIcon('beaker'),
  [TreeItemType.FOLDER]: new vscode.ThemeIcon('folder'),
  [TreeItemType.FILE]: new vscode.ThemeIcon('file'),
  [TreeItemType.VALUE]: new vscode.ThemeIcon('symbol-variable'),
  [TreeItemType.ARRAY]: new vscode.ThemeIcon('symbol-array'),
  [TreeItemType.OBJECT]: new vscode.ThemeIcon('symbol-namespace'),
  [TreeItemType.ERROR]: new vscode.ThemeIcon('error'),
  [TreeItemType.LOADING]: new vscode.ThemeIcon('loading~spin')
};

/**
 * Test status icons
 */
export const TestStatusIcons: Record<TestResult['status'], vscode.ThemeIcon> = {
  passed: new vscode.ThemeIcon('testing-passed-icon'),
  failed: new vscode.ThemeIcon('testing-failed-icon'),
  skipped: new vscode.ThemeIcon('testing-skipped-icon'),
  pending: new vscode.ThemeIcon('testing-queued-icon')
};

/**
 * Event data for tree refresh
 */
export interface TreeRefreshEvent<T> {
  element?: T;
  recursive?: boolean;
  reason?: string;
}

/**
 * Cache entry for tree data
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Pagination options for API requests
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  cursor?: string;
  limit?: number;
}

/**
 * Tree data loading state
 */
export enum LoadingState {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}

/**
 * Error information for tree items
 */
export interface TreeErrorInfo {
  message: string;
  code?: string;
  details?: any;
  retry?: boolean;
}