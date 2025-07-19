import * as vscode from 'vscode';
import { BaseView as IBaseView } from '../types';

export abstract class BaseView implements IBaseView {
  protected context: vscode.ExtensionContext;
  protected disposables: vscode.Disposable[] = [];
  protected isDisposed = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  abstract render(): void;

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposables.forEach(disposable => {
      try {
        disposable.dispose();
      } catch (error) {
        console.error('Error disposing resource:', error);
      }
    });

    this.disposables = [];
    this.isDisposed = true;
  }

  protected registerDisposable(disposable: vscode.Disposable): void {
    if (this.isDisposed) {
      disposable.dispose();
      return;
    }
    
    this.disposables.push(disposable);
    this.context.subscriptions.push(disposable);
  }

  protected createCommand(
    command: string,
    callback: (...args: any[]) => any,
    thisArg?: any
  ): vscode.Disposable {
    const disposable = vscode.commands.registerCommand(command, callback, thisArg);
    this.registerDisposable(disposable);
    return disposable;
  }

  protected showInformationMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(message, ...items);
  }

  protected showWarningMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(message, ...items);
  }

  protected showErrorMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(message, ...items);
  }

  protected getConfiguration(section?: string): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(section);
  }

  protected onConfigurationChanged(
    callback: (e: vscode.ConfigurationChangeEvent) => void
  ): void {
    const disposable = vscode.workspace.onDidChangeConfiguration(callback);
    this.registerDisposable(disposable);
  }

  protected isConfigurationChanged(
    e: vscode.ConfigurationChangeEvent,
    section: string
  ): boolean {
    return e.affectsConfiguration(section);
  }
}