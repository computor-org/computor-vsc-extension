import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../base/BaseWebviewPanel';

export class UIShowcaseView extends BaseWebviewPanel {
  constructor(context: vscode.ExtensionContext) {
    super(context, 'uiShowcase', 'UI Component Showcase');
  }

  getHtml(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>UI Component Showcase</title>
        <!-- Styles are inline for this showcase -->
        <style>
          body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            max-width: 100%;
            overflow-x: hidden;
          }
          .showcase-section {
            margin-bottom: 40px;
          }
          .showcase-section h2 {
            margin-bottom: 20px;
            color: var(--vscode-foreground);
          }
          .showcase-section h3 {
            margin-bottom: 16px;
            color: var(--vscode-foreground);
            font-size: 16px;
          }
          .component-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
          }
          .component-row {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            align-items: center;
          }
          .full-width {
            width: 100%;
          }
          .max-width-400 {
            max-width: 400px;
          }
          /* Button styles */
          .vscode-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: var(--vscode-font-family);
            font-weight: 400;
            border: 1px solid transparent;
            border-radius: 2px;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            user-select: none;
            position: relative;
            outline: none;
            text-decoration: none;
            padding: 6px 14px;
            font-size: 13px;
            line-height: 20px;
          }
          .vscode-button--primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .vscode-button--primary:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
          }
          .vscode-button--secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .vscode-button--secondary:hover:not(:disabled) {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          .vscode-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          /* Input styles */
          .vscode-input {
            font-family: var(--vscode-font-family);
            font-weight: 400;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            outline: none;
            width: 100%;
            transition: all 0.2s ease;
            padding: 6px 10px;
            font-size: 13px;
            line-height: 20px;
            box-sizing: border-box;
          }
          .vscode-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
          }
          .vscode-input:focus {
            border-color: var(--vscode-focusBorder);
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
          }
          .vscode-input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .vscode-input--error {
            border-color: var(--vscode-inputValidation-errorBorder);
            background-color: var(--vscode-inputValidation-errorBackground);
          }
          .input-wrapper {
            position: relative;
            width: 100%;
            box-sizing: border-box;
          }
          .input-error {
            margin-top: 4px;
            font-size: 12px;
            color: var(--vscode-inputValidation-errorForeground);
          }
          /* Card styles */
          .vscode-card {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
            border-radius: 4px;
            position: relative;
            transition: all 0.2s ease;
            padding: 16px;
            border: 1px solid transparent;
            box-sizing: border-box;
          }
          .vscode-card--bordered {
            border: 1px solid var(--vscode-panel-border);
          }
          .vscode-card--elevated {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .vscode-card--elevated:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
          .vscode-card--hoverable:hover {
            background-color: var(--vscode-list-hoverBackground);
          }
          .vscode-card--clickable {
            cursor: pointer;
            user-select: none;
          }
          .vscode-card--selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
          }
          .card-title {
            margin: 0 0 8px 0;
            font-size: 16px;
            font-weight: 600;
          }
          .card-body {
            font-size: 13px;
          }
          .card-footer {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
        </style>
    </head>
    <body>
        <h1>UI Component Showcase</h1>
        
        <div class="showcase-section">
          <h2>Button Components</h2>
          
          <h3>Variants</h3>
          <div class="component-row">
            <button class="vscode-button vscode-button--primary">Primary Button</button>
            <button class="vscode-button vscode-button--secondary">Secondary Button</button>
            <button class="vscode-button vscode-button--primary" disabled>Disabled Button</button>
          </div>

          <h3>With Icons</h3>
          <div class="component-row">
            <button class="vscode-button vscode-button--primary">
              <span style="margin-right: 6px;">📁</span>
              Open File
            </button>
            <button class="vscode-button vscode-button--secondary">
              <span style="margin-right: 6px;">💾</span>
              Save
            </button>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Input Components</h2>
          
          <h3>Basic Inputs</h3>
          <div class="component-grid">
            <div class="input-wrapper">
              <input type="text" class="vscode-input" placeholder="Text input">
            </div>
            <div class="input-wrapper">
              <input type="password" class="vscode-input" placeholder="Password input">
            </div>
            <div class="input-wrapper">
              <input type="email" class="vscode-input" placeholder="Email input">
            </div>
          </div>

          <h3>Input States</h3>
          <div class="component-grid">
            <div class="input-wrapper">
              <input type="text" class="vscode-input" placeholder="Normal input">
            </div>
            <div class="input-wrapper">
              <input type="text" class="vscode-input" placeholder="Disabled input" disabled>
            </div>
            <div class="input-wrapper">
              <input type="text" class="vscode-input vscode-input--error" placeholder="Error input">
              <div class="input-error">This field is required</div>
            </div>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Card Components</h2>
          
          <h3>Card Variants</h3>
          <div class="component-grid">
            <div class="vscode-card">
              <h3 class="card-title">Default Card</h3>
              <div class="card-body">
                This is a basic card with default styling.
              </div>
            </div>
            <div class="vscode-card vscode-card--bordered">
              <h3 class="card-title">Bordered Card</h3>
              <div class="card-body">
                This card has a visible border.
              </div>
            </div>
            <div class="vscode-card vscode-card--elevated">
              <h3 class="card-title">Elevated Card</h3>
              <div class="card-body">
                This card has a shadow effect.
              </div>
            </div>
          </div>

          <h3>Interactive Cards</h3>
          <div class="component-grid">
            <div class="vscode-card vscode-card--bordered vscode-card--hoverable">
              <h3 class="card-title">Hoverable Card</h3>
              <div class="card-body">
                This card changes on hover.
              </div>
            </div>
            <div class="vscode-card vscode-card--bordered vscode-card--clickable" onclick="vscode.postMessage({type: 'cardClick', value: 'Card clicked!'})">
              <h3 class="card-title">Clickable Card</h3>
              <div class="card-body">
                Click this card to see an action.
              </div>
            </div>
          </div>

          <h3>Card with Actions</h3>
          <div class="max-width-400">
            <div class="vscode-card vscode-card--bordered">
              <h3 class="card-title">Card with Footer</h3>
              <div class="card-body">
                This card demonstrates how to use footer actions with buttons.
              </div>
              <div class="card-footer">
                <button class="vscode-button vscode-button--secondary">Cancel</button>
                <button class="vscode-button vscode-button--primary">Confirm</button>
              </div>
            </div>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Form Example</h2>
          <div class="max-width-400">
            <div class="vscode-card vscode-card--bordered">
              <h3 class="card-title">User Registration</h3>
              <form id="sampleForm">
                <div style="display: flex; flex-direction: column; gap: 16px;">
                  <div class="input-wrapper">
                    <input type="text" class="vscode-input" placeholder="Username" required>
                  </div>
                  <div class="input-wrapper">
                    <input type="email" class="vscode-input" placeholder="Email" required>
                  </div>
                  <div class="input-wrapper">
                    <input type="password" class="vscode-input" placeholder="Password" required>
                  </div>
                  <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                    <button type="button" class="vscode-button vscode-button--secondary">Cancel</button>
                    <button type="submit" class="vscode-button vscode-button--primary">Register</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          
          // Handle form submission
          document.getElementById('sampleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            vscode.postMessage({
              type: 'formSubmit',
              value: 'Form submitted!'
            });
          });

          // Add interactive behavior to cards
          document.querySelectorAll('.vscode-card--clickable').forEach(card => {
            card.addEventListener('click', () => {
              // Toggle selected state
              card.classList.toggle('vscode-card--selected');
            });
          });

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received message:', message);
          });
        </script>
    </body>
    </html>`;
  }

  handleMessage(message: any): void {
    switch (message.type) {
      case 'cardClick':
        vscode.window.showInformationMessage(message.value);
        break;
      case 'formSubmit':
        vscode.window.showInformationMessage(message.value);
        break;
    }
  }
}