import * as vscode from 'vscode';
import { ComputorApiService } from '../services/ComputorApiService';
import { UserPassword } from '../types/generated/users';

export class UserPasswordCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private apiService: ComputorApiService
  ) {}

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.user.changePassword', () => this.changePassword())
    );
  }

  private async changePassword(): Promise<void> {
    const secretKey = 'computor.auth';
    const storedRaw = await this.context.secrets.get(secretKey);
    const storedAuth: any = storedRaw ? JSON.parse(storedRaw) : undefined;

    if (!storedAuth || storedAuth.type !== 'basic' || !storedAuth.username) {
      vscode.window.showErrorMessage('Password changes are only supported for Basic Auth logins.');
      return;
    }

    try {
      const rawClient: any = (this.apiService as any).httpClient;
      if (!rawClient && !this.apiService.isAuthenticated()) {
        vscode.window.showErrorMessage('Please login before changing your password.');
        return;
      }

      const oldPassword = await vscode.window.showInputBox({
        prompt: 'Enter current password',
        password: true,
        ignoreFocusOut: true,
        title: 'Change Password'
      });

      if (oldPassword === undefined) {
        return;
      }

      if (!oldPassword) {
        vscode.window.showWarningMessage('Current password cannot be empty.');
        return;
      }

      const newPassword = await vscode.window.showInputBox({
        prompt: 'Enter new password',
        password: true,
        ignoreFocusOut: true,
        title: 'Change Password'
      });

      if (!newPassword) {
        vscode.window.showWarningMessage('New password cannot be empty.');
        return;
      }

      const confirmPassword = await vscode.window.showInputBox({
        prompt: 'Confirm new password',
        password: true,
        ignoreFocusOut: true,
        title: 'Change Password'
      });

      if (!confirmPassword) {
        vscode.window.showWarningMessage('Confirmation cannot be empty.');
        return;
      }

      if (newPassword !== confirmPassword) {
        vscode.window.showErrorMessage('Passwords do not match.');
        return;
      }

      const payload: UserPassword = {
        password_old: oldPassword,
        password: newPassword
      };

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Updating password...'
      }, async () => {
        await this.apiService.updateUserPassword(payload);
      });

      await this.updateStoredCredentials(secretKey, storedAuth.username, newPassword);
      vscode.window.showInformationMessage('Password updated successfully.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to update password: ${error?.message || error}`);
    }
  }

  private async updateStoredCredentials(secretKey: string, username: string, newPassword: string): Promise<void> {
    try {
      const storedRaw = await this.context.secrets.get(secretKey);
      if (storedRaw) {
        const storedAuth: any = JSON.parse(storedRaw);
        if (storedAuth?.type === 'basic') {
          storedAuth.password = newPassword;
          await this.context.secrets.store(secretKey, JSON.stringify(storedAuth));
        }
      }

      const client: any = (this.apiService as any).httpClient;
      if (client && typeof client.setCredentials === 'function') {
        client.setCredentials(username, newPassword);
        try {
          await client.authenticate();
        } catch (error) {
          console.warn('Failed to re-authenticate after password change:', error);
        }
      }
    } catch (error) {
      console.warn('Failed to update stored credentials after password change:', error);
    }
  }
}
