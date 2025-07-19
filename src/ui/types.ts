import * as vscode from 'vscode';

export interface ViewConstructor {
  new (context: vscode.ExtensionContext): BaseView;
}

export interface BaseView {
  render(): void;
  dispose(): void;
}

export interface WebviewMessage {
  type: string;
  payload?: any;
}

export type ViewState = Record<string, any>;

export interface StateListener<T = ViewState> {
  (state: T): void;
}

export interface TreeItemData {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | string;
  contextValue?: string;
  children?: TreeItemData[];
}