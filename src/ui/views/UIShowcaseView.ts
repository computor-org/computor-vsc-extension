import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../base/BaseWebviewPanel';

export class UIShowcaseView extends BaseWebviewPanel {
  constructor(context: vscode.ExtensionContext) {
    super(context, 'uiShowcase', 'UI Component Showcase');
  }

  getHtml(): string {
    const nonce = this.generateNonce();
    const cspSource = this.getCspSource();
    
    // Get URIs for our webview UI files
    const baseComponentUri = this.getWebviewUri('webview-ui/components/base.js');
    const buttonUri = this.getWebviewUri('webview-ui/components/button.js');
    const inputUri = this.getWebviewUri('webview-ui/components/input.js');
    const selectUri = this.getWebviewUri('webview-ui/components/select.js');
    const checkboxUri = this.getWebviewUri('webview-ui/components/checkbox.js');
    const progressUri = this.getWebviewUri('webview-ui/components/progress.js');
    const cardUri = this.getWebviewUri('webview-ui/components/card.js');
    const showcaseUri = this.getWebviewUri('webview-ui/showcase.js');
    const componentsStyleUri = this.getWebviewUri('webview-ui/components/components.css');
    const showcaseStyleUri = this.getWebviewUri('webview-ui/showcase.css');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} https:; font-src ${cspSource};">
        <title>UI Component Showcase</title>
        <link href="${componentsStyleUri}" rel="stylesheet">
        <link href="${showcaseStyleUri}" rel="stylesheet">
    </head>
    <body>
        <h1>🎨 UI Component Showcase</h1>
        <p>Interactive demonstration of all UI components</p>
        
        <div id="showcase-container">
          <!-- Components will be rendered here by JavaScript -->
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
        </script>
        
        <!-- Load component files in order -->
        <script nonce="${nonce}" src="${baseComponentUri}"></script>
        <script nonce="${nonce}" src="${buttonUri}"></script>
        <script nonce="${nonce}" src="${inputUri}"></script>
        <script nonce="${nonce}" src="${selectUri}"></script>
        <script nonce="${nonce}" src="${checkboxUri}"></script>
        <script nonce="${nonce}" src="${progressUri}"></script>
        <script nonce="${nonce}" src="${cardUri}"></script>
        
        <!-- Load the showcase script -->
        <script nonce="${nonce}" src="${showcaseUri}"></script>
    </body>
    </html>`;
  }

  handleMessage(message: any): void {
    switch (message.type) {
      case 'formSubmit':
        vscode.window.showInformationMessage(`Form submitted successfully! Data: ${JSON.stringify(message.data)}`);
        break;
      case 'error':
        vscode.window.showErrorMessage(message.message);
        break;
      case 'info':
        vscode.window.showInformationMessage(message.message);
        break;
      default:
        console.log('Received message:', message);
    }
  }
}