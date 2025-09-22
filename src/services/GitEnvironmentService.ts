import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type GitExtensionExports = {
  getAPI(version: number): { git: { path?: string | undefined } }; // minimal subset of vscode.git API we rely on
};

export class GitEnvironmentService {
  private static instance: GitEnvironmentService | null = null;
  private currentCheck: Promise<boolean> | null = null;
  private gitBinaryPath: string | null = null;

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
    const gitBinary = await this.ensureGitBinary();
    if (!gitBinary) {
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

  private async ensureGitBinary(): Promise<string | undefined> {
    const binary = await this.resolveGitBinary();
    if (!binary) {
      void vscode.window.showErrorMessage('Git is required but was not found. Install Git and ensure it is available on your PATH.');
      return undefined;
    }

    return binary;
  }

  private async getGlobalConfigValue(key: string): Promise<string | undefined> {
    try {
      const stdout = await this.runGitCommand(['config', '--global', '--get', key]);
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

  private async resolveGitBinary(): Promise<string | undefined> {
    if (this.gitBinaryPath) {
      return this.gitBinaryPath;
    }

    const candidates: (string | undefined)[] = [
      'git',
      this.getConfiguredGitPath(),
      await this.getGitExtensionPath(),
      ...this.getCommonGitInstallPaths()
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeGitPath(candidate);
      if (!normalized) {
        continue;
      }

      const verified = await this.verifyGitBinary(normalized);
      if (verified) {
        this.gitBinaryPath = verified;
        return verified;
      }
    }

    return undefined;
  }

  private normalizeGitPath(candidate: string | undefined): string | undefined {
    if (!candidate) {
      return undefined;
    }

    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    if (trimmed.startsWith('~')) {
      return path.join(os.homedir(), trimmed.slice(1));
    }

    return trimmed;
  }

  private async verifyGitBinary(binary: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(binary, ['--version']);
      if (stdout && stdout.trim().length > 0) {
        return binary;
      }
    } catch (error) {
      console.debug('Git binary verification failed for', binary, error);
    }

    return undefined;
  }

  private async runGitCommand(args: string[]): Promise<string> {
    const binary = await this.ensureGitBinary();
    if (!binary) {
      throw new Error('Git binary is not available');
    }

    const { stdout } = await execFileAsync(binary, args);
    return stdout;
  }

  private getCommonGitInstallPaths(): string[] {
    return [
      '/usr/bin/git',
      '/usr/local/bin/git',
      '/opt/homebrew/bin/git'
    ];
  }

  private getConfiguredGitPath(): string | undefined {
    const configured = vscode.workspace.getConfiguration('git').get<string>('path');
    return configured ? configured.trim() : undefined;
  }

  private async getGitExtensionPath(): Promise<string | undefined> {
    const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!gitExtension) {
      return undefined;
    }

    if (!gitExtension.isActive) {
      try {
        await gitExtension.activate();
      } catch (error) {
        console.warn('Failed to activate built-in Git extension for path resolution:', error);
        return undefined;
      }
    }

    try {
      const api = gitExtension.exports?.getAPI?.(1);
      const path = api?.git?.path;
      return path ? path.trim() : undefined;
    } catch (error) {
      console.warn('Failed to read Git path from vscode.git API:', error);
      return undefined;
    }
  }

  getGitBinaryPathSync(): string {
    return this.gitBinaryPath ?? 'git';
  }

  async getGitBinaryPath(): Promise<string | undefined> {
    return this.resolveGitBinary();
  }

  getGitBinaryHint(): string {
    if (this.gitBinaryPath) {
      return this.gitBinaryPath;
    }

    const configured = this.normalizeGitPath(this.getConfiguredGitPath());
    if (configured) {
      return configured;
    }

    return 'git';
  }
}
