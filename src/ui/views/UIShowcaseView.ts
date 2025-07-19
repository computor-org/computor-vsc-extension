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
    const componentsUri = this.getWebviewUri('webview-ui/components.js');
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
          console.log('VS Code API acquired');
        </script>
        
        <!-- Load bundled components -->
        <script nonce="${nonce}" src="${componentsUri}" onload="console.log('Components loaded')"></script>
        
        <!-- Load the showcase script -->
        <script nonce="${nonce}" src="${showcaseUri}" onload="console.log('Showcase loaded')"></script>
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
      case 'buttonClicked':
        vscode.window.showInformationMessage(`Button clicked: ${message.data.button} at ${message.data.timestamp}`);
        break;
      case 'loadingStarted':
        vscode.window.showInformationMessage(message.data.message);
        break;
      case 'loadingCompleted':
        vscode.window.showInformationMessage(message.data.message);
        break;
      case 'saveAction':
        vscode.window.showInformationMessage(`💾 Save action triggered at ${message.data.timestamp}`);
        break;
      case 'navigation':
        vscode.window.showInformationMessage(`→ Navigation: ${message.data.direction}`);
        break;
      case 'refreshAction':
        vscode.window.showInformationMessage('🔄 Refresh action triggered');
        break;
      case 'languageSelected':
        vscode.window.showInformationMessage(`Language selected: ${message.data.language}`);
        break;
      case 'themeSelected':
        vscode.window.showInformationMessage(`Theme selected: ${message.data.theme}`);
        break;
      case 'checkboxChanged':
        vscode.window.showInformationMessage(`${message.data.option} ${message.data.checked ? 'enabled' : 'disabled'}`);
        break;
      case 'progressChanged':
        vscode.window.showInformationMessage(`Progress ${message.data.action}: ${message.data.value}%`);
        break;
      case 'formFieldChanged':
        vscode.window.showInformationMessage(`Form field '${message.data.field}' changed: ${message.data.value}`);
        break;
      default:
        console.log('Received message:', message);
    }
  }
}