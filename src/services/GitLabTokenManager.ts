import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { OrganizationList, CourseList } from '../types/generated';

/**
 * GitLab Token Manager - Singleton service for managing GitLab tokens
 * Used by all views (lecturer, tutor, student) to access GitLab repositories
 */
export class GitLabTokenManager {
  private static instance: GitLabTokenManager;
  private settingsManager: ComputorSettingsManager;
  private tokenCache: Map<string, string> = new Map();

  private constructor(private context: vscode.ExtensionContext) {
    this.settingsManager = new ComputorSettingsManager(context);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(context: vscode.ExtensionContext): GitLabTokenManager {
    if (!GitLabTokenManager.instance) {
      GitLabTokenManager.instance = new GitLabTokenManager(context);
    }
    return GitLabTokenManager.instance;
  }

  /**
   * Extract unique GitLab URLs from organizations and ensure we have tokens for each
   */
  async ensureTokensForOrganizations(organizations: OrganizationList[]): Promise<void> {
    const gitlabUrls = this.extractUniqueGitLabUrls(organizations);
    
    for (const url of gitlabUrls) {
      // Check if we already have a token for this URL
      let token = await this.getToken(url);
      
      if (!token) {
        // Prompt for token
        token = await this.promptForToken(url);
        if (token) {
          await this.storeToken(url, token);
        }
      }
    }
  }

  /**
   * Extract unique GitLab URLs from organizations
   */
  private extractUniqueGitLabUrls(organizations: OrganizationList[]): Set<string> {
    const urls = new Set<string>();
    
    // Note: OrganizationList doesn't have properties in the type, 
    // we might need to fetch full organization details
    // For now, we'll need to handle this when we get course details
    
    return urls;
  }

  /**
   * Extract GitLab URL from a course
   */
  extractGitLabUrlFromCourse(course: CourseList): string | undefined {
    if (course.properties?.gitlab?.url) {
      try {
        const url = new URL(course.properties.gitlab.url);
        return url.origin;
      } catch {
        // Invalid URL
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Ensure we have a token for a specific GitLab instance
   */
  async ensureTokenForUrl(gitlabUrl: string): Promise<string | undefined> {
    // Check cache first
    if (this.tokenCache.has(gitlabUrl)) {
      return this.tokenCache.get(gitlabUrl);
    }

    // Check stored token
    let token = await this.getToken(gitlabUrl);
    
    if (!token) {
      // Prompt for token
      token = await this.promptForToken(gitlabUrl);
      if (token) {
        await this.storeToken(gitlabUrl, token);
      }
    }

    if (token) {
      this.tokenCache.set(gitlabUrl, token);
    }

    return token;
  }

  /**
   * Prompt user for GitLab personal access token
   */
  private async promptForToken(gitlabUrl: string, value?: string): Promise<string | undefined> {
    const token = await vscode.window.showInputBox({
      title: `GitLab Authentication for ${gitlabUrl}`,
      prompt: `Enter your GitLab Personal Access Token for ${gitlabUrl}`,
      placeHolder: 'glpat-xxxxxxxxxxxxxxxxxxxx',
      value,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value) {
          return 'Token is required';
        }
        // Basic validation - GitLab tokens can have various formats
        // glpat-xxxx (new format), or just alphanumeric with dashes/underscores
        if (value.length < 10) {
          return 'Token seems too short';
        }
        return undefined;
      }
    });

    return token;
  }

  public async requestAndStoreToken(gitlabUrl: string, existing?: string): Promise<string | undefined> {
    const token = await this.promptForToken(gitlabUrl, existing);
    if (token) {
      await this.storeToken(gitlabUrl, token);
    }
    return token;
  }

  /**
   * Get stored token for a GitLab URL
   */
  async getToken(gitlabUrl: string): Promise<string | undefined> {
    // First check cache
    if (this.tokenCache.has(gitlabUrl)) {
      return this.tokenCache.get(gitlabUrl);
    }

    // Then check secure storage
    const token = await this.context.secrets.get(`gitlab-token-${gitlabUrl}`);
    
    if (token) {
      // Update cache
      this.tokenCache.set(gitlabUrl, token);
    }

    return token;
  }

  /**
   * Store token securely for a GitLab URL
   */
  async storeToken(gitlabUrl: string, token: string): Promise<void> {
    // Store in secure storage
    await this.context.secrets.store(`gitlab-token-${gitlabUrl}`, token);
    
    // Update cache
    this.tokenCache.set(gitlabUrl, token);
    
    vscode.window.showInformationMessage(`GitLab token stored for ${gitlabUrl}`);
  }

  /**
   * Remove token for a GitLab URL
   */
  async removeToken(gitlabUrl: string): Promise<void> {
    // Remove from secure storage
    await this.context.secrets.delete(`gitlab-token-${gitlabUrl}`);
    
    // Remove from cache
    this.tokenCache.delete(gitlabUrl);
  }

  /**
   * Get all stored GitLab URLs
   */
  async getStoredGitLabUrls(): Promise<string[]> {
    // This is a bit tricky as VS Code doesn't provide a way to list all secrets
    // We'll need to track this separately in settings
    const settings = await this.settingsManager.getSettings();
    return Object.keys(settings.workspace?.gitlabTokens || {});
  }

  /**
   * Clear all tokens
   */
  async clearAllTokens(): Promise<void> {
    const urls = await this.getStoredGitLabUrls();
    for (const url of urls) {
      await this.removeToken(url);
    }
    this.tokenCache.clear();
  }

  /**
   * Build clone URL with token
   */
  buildAuthenticatedCloneUrl(repoUrl: string, token: string): string {
    try {
      const url = new URL(repoUrl);
      // For GitLab, we can use oauth2 as username with the token as password
      url.username = 'oauth2';
      url.password = token;
      return url.toString();
    } catch {
      // If URL parsing fails, try basic concatenation
      return repoUrl.replace('https://', `https://oauth2:${token}@`);
    }
  }
}
