import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../base/BaseWebviewPanel';

export class UIShowcaseView extends BaseWebviewPanel {
  constructor(context: vscode.ExtensionContext) {
    super(context, 'uiShowcase', 'UI Component Showcase');
  }

  getHtml(): string {
    const nonce = this.generateNonce();
    const cspSource = this.getCspSource();

    // For now, we'll use a simplified HTML that demonstrates our components
    // In a production setup, we'd compile the React app and load it
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https:; font-src ${cspSource};">
        <title>UI Component Showcase</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
          }
          
          .info-box {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 20px;
          }
          
          .info-box h2 {
            margin-top: 0;
            color: var(--vscode-foreground);
          }
          
          code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
          }
          
          ul {
            list-style: none;
            padding-left: 0;
          }
          
          li {
            margin-bottom: 8px;
            padding-left: 20px;
            position: relative;
          }
          
          li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: var(--vscode-terminal-ansiGreen);
          }
        </style>
    </head>
    <body>
        <h1>UI Component Showcase</h1>
        
        <div class="info-box">
          <h2>React Components Ready!</h2>
          <p>We've created a comprehensive set of React components for VS Code extensions:</p>
          
          <h3>Available Components:</h3>
          <ul>
            <li><strong>Button</strong> - Primary, Secondary, Tertiary, Danger variants with loading states</li>
            <li><strong>Input</strong> - Text, Password, Email, Number, Search types with validation</li>
            <li><strong>Select</strong> - Dropdown with custom styling and error states</li>
            <li><strong>Checkbox</strong> - With label support and indeterminate state</li>
            <li><strong>Radio</strong> - Including RadioGroup helper component</li>
            <li><strong>Progress</strong> - Linear and circular progress indicators</li>
            <li><strong>Card</strong> - Container with Header, Body, Footer sub-components</li>
          </ul>
          
          <h3>Usage Example:</h3>
          <pre><code>import { Button, Input, Card } from '@computor/ui';

const MyView = () => {
  return (
    &lt;Card variant="bordered"&gt;
      &lt;Card.Title&gt;My Extension&lt;/Card.Title&gt;
      &lt;Card.Body&gt;
        &lt;Input placeholder="Enter text..." /&gt;
        &lt;Button variant="primary"&gt;Submit&lt;/Button&gt;
      &lt;/Card.Body&gt;
    &lt;/Card&gt;
  );
};</code></pre>
          
          <h3>Next Steps:</h3>
          <p>To use these components in a real view, you'll need to:</p>
          <ol>
            <li>Set up a build process to compile React/TypeScript</li>
            <li>Bundle the components for webview usage</li>
            <li>Create your custom views using these components</li>
          </ol>
          
          <p><strong>Note:</strong> The components are styled to automatically match VS Code's current theme (light/dark).</p>
        </div>
        
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          console.log('UI Showcase loaded successfully!');
        </script>
    </body>
    </html>`;
  }

  handleMessage(message: any): void {
    console.log('Received message:', message);
  }
}