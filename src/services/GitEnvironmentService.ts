import * as vscode from 'vscode';
import { execAsync } from '../utils/exec';

export class GitEnvironmentService {
  private static instance: GitEnvironmentService | null = null;
  private currentCheck: Promise<boolean> | null = null;

  static getInstance(): GitEnvironmentService {
    if (!GitEnvironmentService.instance) {
      GitEnvironmentService.instance = new GitEnvironmentService();
    }
    return GitEnvironmentService.instance;
  }

  async validateGitEnvironment(): Promise<boolean> {
    if (this.currentCheck) {
      return this.currentCheck;
    }

    this.currentCheck = this.performValidation().finally(() => {
      this.currentCheck = null;
    });

    return this.currentCheck;
  }

  private async performValidation(): Promise<boolean> {
    const hasGit = await this.ensureGitBinary();
    if (!hasGit) {
      return false;
    }

    const [userName, userEmail] = await Promise.all([
      this.getGlobalConfigValue('user.name'),
      this.getGlobalConfigValue('user.email')
    ]);

    const missing: string[] = [];
    const commands: string[] = [];

    if (!userName) {
      missing.push('user.name');
      commands.push('git config --global user.name "Your Name"');
    }

    if (!userEmail) {
      missing.push('user.email');
      commands.push('git config --global user.email "you@example.com"');
    }

    if (missing.length > 0) {
      const missingText = missing.join(' and ');
      const exampleCommands = commands.join('\n');
      void vscode.window.showWarningMessage(
        `Git ${missingText} ${missing.length === 1 ? 'is' : 'are'} not configured. Configure them so commits have correct author information.\n${exampleCommands}`
      );
      return false;
    }

    return true;
  }

  private async ensureGitBinary(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git --version');
      if (stdout && stdout.trim().length > 0) {
        return true;
      }
    } catch (error) {
      console.error('Git availability check failed:', error);
    }

    void vscode.window.showErrorMessage('Git is required but was not found. Install Git and ensure it is available on your PATH.');
    return false;
  }

  private async getGlobalConfigValue(key: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`git config --global --get ${key}`);
      const value = stdout.trim();
      return value.length > 0 ? value : undefined;
    } catch (error: any) {
      const code = typeof error?.code === 'number' ? error.code : undefined;
      if (code !== 1) {
        console.warn(`Git config lookup failed for ${key}:`, error);
      }
      return undefined;
    }
  }
}
