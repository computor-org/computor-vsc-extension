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
          /* Select styles */
          .vscode-select {
            font-family: var(--vscode-font-family);
            font-weight: 400;
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 2px;
            outline: none;
            width: 100%;
            transition: all 0.2s ease;
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='%23cccccc' d='M4.427 5.427l3.573 3.573 3.573-3.573L12 6l-4 4-4-4z'/%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 8px center;
            background-size: 16px;
            padding-right: 32px;
            box-sizing: border-box;
            padding: 6px 32px 6px 10px;
            font-size: 13px;
            line-height: 20px;
          }
          .vscode-select--sm {
            padding: 4px 32px 4px 8px;
            font-size: 12px;
            line-height: 18px;
          }
          .vscode-select--lg {
            padding: 10px 32px 10px 14px;
            font-size: 14px;
            line-height: 20px;
          }
          .vscode-select:focus {
            border-color: var(--vscode-focusBorder);
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
          }
          .vscode-select:hover:not(:disabled) {
            border-color: var(--vscode-dropdown-border);
          }
          .vscode-select--error {
            border-color: var(--vscode-inputValidation-errorBorder);
            background-color: var(--vscode-inputValidation-errorBackground);
          }
          .vscode-select:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          /* Checkbox styles */
          .vscode-checkbox-wrapper {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
          }
          .vscode-checkbox-hidden {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
          }
          .vscode-checkbox {
            width: 18px;
            height: 18px;
            border: 1px solid var(--vscode-checkbox-border);
            background-color: var(--vscode-checkbox-background);
            border-radius: 3px;
            transition: all 0.2s ease;
            position: relative;
            flex-shrink: 0;
            display: inline-block;
          }
          .vscode-checkbox-wrapper:hover .vscode-checkbox:not([disabled]) {
            border-color: var(--vscode-focusBorder);
          }
          .vscode-checkbox-hidden:focus + .vscode-checkbox {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
          }
          .vscode-checkbox--checked {
            background-color: var(--vscode-checkbox-selectBackground);
            border-color: var(--vscode-checkbox-selectBorder);
          }
          .vscode-checkbox--checked::after {
            content: '';
            position: absolute;
            left: 5px;
            top: 2px;
            width: 5px;
            height: 9px;
            border: solid var(--vscode-checkbox-foreground);
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
          }
          .vscode-checkbox-label {
            margin-left: 8px;
          }
          /* Radio styles */
          .vscode-radio-wrapper {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
          }
          .vscode-radio-hidden {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
          }
          .vscode-radio {
            width: 18px;
            height: 18px;
            border: 1px solid var(--vscode-checkbox-border);
            background-color: var(--vscode-checkbox-background);
            border-radius: 50%;
            transition: all 0.2s ease;
            position: relative;
            flex-shrink: 0;
            display: inline-block;
          }
          .vscode-radio-wrapper:hover .vscode-radio:not([disabled]) {
            border-color: var(--vscode-focusBorder);
          }
          .vscode-radio-hidden:focus + .vscode-radio {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
          }
          .vscode-radio--checked {
            background-color: var(--vscode-checkbox-selectBackground);
            border-color: var(--vscode-checkbox-selectBorder);
          }
          .vscode-radio--checked::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-checkbox-foreground);
          }
          .vscode-radio-label {
            margin-left: 8px;
          }
          /* Progress styles */
          .vscode-progress-container {
            position: relative;
            width: 100%;
            background-color: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            height: 8px;
          }
          .vscode-progress-container--sm {
            height: 4px;
          }
          .vscode-progress-container--lg {
            height: 12px;
          }
          .vscode-progress-bar {
            height: 100%;
            transition: width 0.3s ease;
            border-radius: 4px;
            position: relative;
            background-color: var(--vscode-button-background);
          }
          .vscode-progress-bar--success {
            background-color: var(--vscode-terminal-ansiGreen);
          }
          .vscode-progress-bar--warning {
            background-color: var(--vscode-terminal-ansiYellow);
          }
          .vscode-progress-bar--error {
            background-color: var(--vscode-inputValidation-errorBackground);
          }
          .vscode-progress-bar--indeterminate {
            width: 50%;
            animation: progress-indeterminate 1.5s ease-in-out infinite;
          }
          @keyframes progress-indeterminate {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(200%);
            }
          }
          .vscode-progress-label {
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
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
          <h2>Select Components</h2>
          
          <h3>Select Sizes</h3>
          <div class="component-row">
            <select class="vscode-select vscode-select--sm">
              <option value="">Small Select</option>
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
            <select class="vscode-select">
              <option value="">Medium Select (Default)</option>
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
            <select class="vscode-select vscode-select--lg">
              <option value="">Large Select</option>
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
          </div>

          <h3>Select States</h3>
          <div class="component-grid">
            <select class="vscode-select">
              <option value="">Choose an option...</option>
              <option value="js">JavaScript</option>
              <option value="ts">TypeScript</option>
              <option value="py">Python</option>
              <option value="go">Go</option>
            </select>
            <select class="vscode-select" disabled>
              <option>Disabled Select</option>
            </select>
            <div class="input-wrapper">
              <select class="vscode-select vscode-select--error">
                <option value="">Error State</option>
                <option value="1">Option 1</option>
              </select>
              <div class="input-error">Please select an option</div>
            </div>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Checkbox Components</h2>
          
          <h3>Checkbox States</h3>
          <div class="component-row">
            <label class="vscode-checkbox-wrapper">
              <input type="checkbox" class="vscode-checkbox-hidden">
              <span class="vscode-checkbox"></span>
              <span class="vscode-checkbox-label">Unchecked</span>
            </label>
            <label class="vscode-checkbox-wrapper">
              <input type="checkbox" class="vscode-checkbox-hidden" checked>
              <span class="vscode-checkbox vscode-checkbox--checked"></span>
              <span class="vscode-checkbox-label">Checked</span>
            </label>
            <label class="vscode-checkbox-wrapper" style="opacity: 0.5; cursor: not-allowed;">
              <input type="checkbox" class="vscode-checkbox-hidden" disabled>
              <span class="vscode-checkbox"></span>
              <span class="vscode-checkbox-label">Disabled</span>
            </label>
          </div>

          <h3>Checkbox Group</h3>
          <div class="max-width-400">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label class="vscode-checkbox-wrapper">
                <input type="checkbox" class="vscode-checkbox-hidden" name="features" value="autocomplete">
                <span class="vscode-checkbox"></span>
                <span class="vscode-checkbox-label">Enable Autocomplete</span>
              </label>
              <label class="vscode-checkbox-wrapper">
                <input type="checkbox" class="vscode-checkbox-hidden" name="features" value="linting" checked>
                <span class="vscode-checkbox vscode-checkbox--checked"></span>
                <span class="vscode-checkbox-label">Enable Linting</span>
              </label>
              <label class="vscode-checkbox-wrapper">
                <input type="checkbox" class="vscode-checkbox-hidden" name="features" value="formatting">
                <span class="vscode-checkbox"></span>
                <span class="vscode-checkbox-label">Enable Auto-formatting</span>
              </label>
            </div>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Radio Components</h2>
          
          <h3>Radio Group</h3>
          <div class="max-width-400">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label class="vscode-radio-wrapper">
                <input type="radio" class="vscode-radio-hidden" name="theme" value="light">
                <span class="vscode-radio"></span>
                <span class="vscode-radio-label">Light Theme</span>
              </label>
              <label class="vscode-radio-wrapper">
                <input type="radio" class="vscode-radio-hidden" name="theme" value="dark" checked>
                <span class="vscode-radio vscode-radio--checked"></span>
                <span class="vscode-radio-label">Dark Theme</span>
              </label>
              <label class="vscode-radio-wrapper">
                <input type="radio" class="vscode-radio-hidden" name="theme" value="auto">
                <span class="vscode-radio"></span>
                <span class="vscode-radio-label">Auto (System)</span>
              </label>
            </div>
          </div>

          <h3>Horizontal Radio Group</h3>
          <div style="display: flex; gap: 16px;">
            <label class="vscode-radio-wrapper">
              <input type="radio" class="vscode-radio-hidden" name="size" value="sm">
              <span class="vscode-radio"></span>
              <span class="vscode-radio-label">Small</span>
            </label>
            <label class="vscode-radio-wrapper">
              <input type="radio" class="vscode-radio-hidden" name="size" value="md" checked>
              <span class="vscode-radio vscode-radio--checked"></span>
              <span class="vscode-radio-label">Medium</span>
            </label>
            <label class="vscode-radio-wrapper">
              <input type="radio" class="vscode-radio-hidden" name="size" value="lg">
              <span class="vscode-radio"></span>
              <span class="vscode-radio-label">Large</span>
            </label>
          </div>
        </div>

        <div class="showcase-section">
          <h2>Progress Components</h2>
          
          <h3>Progress Bar Variants</h3>
          <div style="display: flex; flex-direction: column; gap: 16px; max-width: 600px;">
            <div>
              <div class="vscode-progress-label">Default Progress - 70%</div>
              <div class="vscode-progress-container">
                <div class="vscode-progress-bar" style="width: 70%;"></div>
              </div>
            </div>
            <div>
              <div class="vscode-progress-label">Success Progress - 100%</div>
              <div class="vscode-progress-container">
                <div class="vscode-progress-bar vscode-progress-bar--success" style="width: 100%;"></div>
              </div>
            </div>
            <div>
              <div class="vscode-progress-label">Warning Progress - 45%</div>
              <div class="vscode-progress-container">
                <div class="vscode-progress-bar vscode-progress-bar--warning" style="width: 45%;"></div>
              </div>
            </div>
            <div>
              <div class="vscode-progress-label">Error Progress - 25%</div>
              <div class="vscode-progress-container">
                <div class="vscode-progress-bar vscode-progress-bar--error" style="width: 25%;"></div>
              </div>
            </div>
          </div>

          <h3>Progress Sizes</h3>
          <div style="display: flex; flex-direction: column; gap: 16px; max-width: 600px;">
            <div class="vscode-progress-container vscode-progress-container--sm">
              <div class="vscode-progress-bar" style="width: 60%;"></div>
            </div>
            <div class="vscode-progress-container">
              <div class="vscode-progress-bar" style="width: 60%;"></div>
            </div>
            <div class="vscode-progress-container vscode-progress-container--lg">
              <div class="vscode-progress-bar" style="width: 60%;"></div>
            </div>
          </div>

          <h3>Indeterminate Progress</h3>
          <div style="max-width: 600px;">
            <div class="vscode-progress-label">Loading...</div>
            <div class="vscode-progress-container">
              <div class="vscode-progress-bar vscode-progress-bar--indeterminate"></div>
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

          // Handle checkboxes
          document.querySelectorAll('.vscode-checkbox-hidden').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
              const visualCheckbox = e.target.nextElementSibling;
              if (e.target.checked) {
                visualCheckbox.classList.add('vscode-checkbox--checked');
              } else {
                visualCheckbox.classList.remove('vscode-checkbox--checked');
              }
            });
          });

          // Handle radios
          document.querySelectorAll('.vscode-radio-hidden').forEach(radio => {
            radio.addEventListener('change', (e) => {
              if (e.target.checked) {
                // Remove checked state from all radios in the same group
                document.querySelectorAll('input[name="' + e.target.name + '"]').forEach(r => {
                  r.nextElementSibling.classList.remove('vscode-radio--checked');
                });
                // Add checked state to the selected radio
                e.target.nextElementSibling.classList.add('vscode-radio--checked');
              }
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