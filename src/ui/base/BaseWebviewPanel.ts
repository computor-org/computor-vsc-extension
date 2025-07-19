import * as vscode from 'vscode';
import * as path from 'path';
import { BaseView } from './BaseView';
import { WebviewMessage } from '../types';

export abstract class BaseWebviewPanel extends BaseView {
  protected panel: vscode.WebviewPanel | undefined;
  protected viewType: string;
  protected title: string;
  protected showOptions: vscode.ViewColumn;
  protected options: vscode.WebviewPanelOptions & vscode.WebviewOptions;

  constructor(
    context: vscode.ExtensionContext,
    viewType: string,
    title: string,
    showOptions: vscode.ViewColumn = vscode.ViewColumn.One,
    options: vscode.WebviewPanelOptions & vscode.WebviewOptions = {}
  ) {
    super(context);
    this.viewType = viewType;
    this.title = title;
    this.showOptions = showOptions;
    this.options = {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'media')),
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'ui')),
      ],
      ...options,
    };
  }

  render(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      this.viewType,
      this.title,
      this.showOptions,
      this.options
    );

    this.setupWebview();
    this.updateWebview();
  }

  private setupWebview(): void {
    if (!this.panel) return;

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        this.handleMessage(message);
      },
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.onPanelDisposed();
      },
      undefined,
      this.disposables
    );

    // Handle view state changes
    this.panel.onDidChangeViewState(
      (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
        this.onViewStateChanged(e.webviewPanel.active, e.webviewPanel.visible);
      },
      undefined,
      this.disposables
    );
  }

  abstract getHtml(): string;
  abstract handleMessage(message: WebviewMessage): void;

  protected onPanelDisposed(): void {
    // Override in subclasses if needed
  }

  protected onViewStateChanged(_active: boolean, _visible: boolean): void {
    // Override in subclasses if needed
  }

  protected updateWebview(): void {
    if (!this.panel) return;
    this.panel.webview.html = this.getHtml();
  }

  protected postMessage(message: WebviewMessage): Thenable<boolean> {
    if (!this.panel) {
      return Promise.resolve(false);
    }
    return this.panel.webview.postMessage(message);
  }

  protected getWebviewUri(localPath: string): vscode.Uri {
    if (!this.panel) {
      throw new Error('Panel not initialized');
    }

    const localResource = vscode.Uri.file(
      path.join(this.context.extensionPath, localPath)
    );

    return this.panel.webview.asWebviewUri(localResource);
  }

  protected getMediaPath(fileName: string): vscode.Uri {
    return this.getWebviewUri(path.join('media', fileName));
  }

  protected getCspSource(): string {
    return this.panel?.webview.cspSource || '';
  }

  protected generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  protected buildHtmlTemplate(
    content: string,
    styles: string[] = [],
    scripts: string[] = []
  ): string {
    const nonce = this.generateNonce();
    const cspSource = this.getCspSource();

    const styleLinks = styles
      .map(style => `<link rel="stylesheet" href="${this.getWebviewUri(style)}">`)
      .join('\n    ');

    const scriptTags = scripts
      .map(script => `<script nonce="${nonce}" src="${this.getWebviewUri(script)}"></script>`)
      .join('\n    ');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https:; font-src ${cspSource};">
    <title>${this.title}</title>
    ${styleLinks}
</head>
<body>
    ${content}
    ${scriptTags}
</body>
</html>`;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    super.dispose();
  }

  get isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  get isActive(): boolean {
    return this.panel?.active ?? false;
  }
}