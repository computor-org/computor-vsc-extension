import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../base/BaseWebviewPanel';
import { ComputorSettingsManager } from '../../settings/ComputorSettingsManager';

export class SettingsView extends BaseWebviewPanel {
  private settingsManager: ComputorSettingsManager;

  constructor(context: vscode.ExtensionContext) {
    super(context, 'settingsView', 'Settings Management');
    this.settingsManager = new ComputorSettingsManager(context);
  }

  getHtml(): string {
    const nonce = this.generateNonce();
    const cspSource = this.getCspSource();
    
    // Get URIs for our webview UI files
    const componentsUri = this.getWebviewUri('webview-ui/components.js');
    const settingsUri = this.getWebviewUri('webview-ui/settings.js');
    const componentsStyleUri = this.getWebviewUri('webview-ui/components/components.css');
    const settingsStyleUri = this.getWebviewUri('webview-ui/settings.css');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} https:; font-src ${cspSource};">
        <title>Settings Management</title>
        <link href="${componentsStyleUri}" rel="stylesheet">
        <link href="${settingsStyleUri}" rel="stylesheet">
    </head>
    <body>
        <h1>⚙️ Settings Management</h1>
        <p>Configure your extension settings</p>
        
        <div id="settings-container">
          <!-- Settings UI will be rendered here by JavaScript -->
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
        </script>
        
        <!-- Load bundled components -->
        <script nonce="${nonce}" src="${componentsUri}"></script>
        
        <!-- Load the settings script -->
        <script nonce="${nonce}" src="${settingsUri}"></script>
    </body>
    </html>`;
  }

  async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'loadSettings':
        try {
          const settings = await this.settingsManager.getSettings();
          const hasToken = await this.settingsManager.retrieveSecureToken('apiToken');
          
          this.postMessage({
            type: 'settingsLoaded',
            payload: {
              ...settings,
              hasApiToken: !!hasToken
            }
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to load settings: ${error}`);
          this.postMessage({ type: 'error', payload: { message: 'Failed to load settings' } });
        }
        break;

      case 'saveSettings':
        try {
          const { apiToken, ...settings } = message.payload;
          
          // Save general settings
          await this.settingsManager.saveSettings({
            version: '1.0.0',
            authentication: settings.authentication
          });
          
          // Save API token securely if provided
          if (apiToken) {
            await this.settingsManager.storeSecureToken('apiToken', apiToken);
          }
          
          vscode.window.showInformationMessage('Settings saved successfully!');
          
          // Send back the saved settings
          const savedSettings = await this.settingsManager.getSettings();
          this.postMessage({
            type: 'settingsSaved',
            payload: savedSettings
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
          this.postMessage({ type: 'error', payload: { message: 'Failed to save settings' } });
        }
        break;

      case 'settingChanged':
        vscode.window.showInformationMessage(`Setting '${message.payload.field}' changed to: ${message.payload.value}`);
        break;

      case 'info':
        vscode.window.showInformationMessage(message.payload.message);
        break;

      case 'error':
        vscode.window.showErrorMessage(message.payload.message);
        break;

      default:
        console.log('Received message:', message);
    }
  }
}