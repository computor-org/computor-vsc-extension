import * as vscode from 'vscode';
import { 
  ComputorCredentials, 
  ComputorAuthenticationSession,
  AuthenticationProviderOptions
} from '../types/AuthenticationTypes';
import { VscodeCredentialStorage } from './VscodeCredentialStorage';

export class ComputorAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
  private static readonly PROVIDER_ID = 'computor';
  private static readonly PROVIDER_LABEL = 'Computor';
  
  private sessions: ComputorAuthenticationSession[] = [];
  private onDidChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this.onDidChangeSessionsEmitter.event;
  
  private credentialStorage: VscodeCredentialStorage;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly options: AuthenticationProviderOptions = {}
  ) {
    this.credentialStorage = new VscodeCredentialStorage(context);
    
    // Register the authentication provider
    this.disposables.push(
      vscode.authentication.registerAuthenticationProvider(
        ComputorAuthenticationProvider.PROVIDER_ID,
        this.options.label || ComputorAuthenticationProvider.PROVIDER_LABEL,
        this,
        { supportsMultipleAccounts: this.options.supportsMultipleAccounts ?? true }
      )
    );
    
    // Load existing sessions
    this.loadSessions();
  }

  async getSessions(scopes?: readonly string[], options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
    void options; // Unused for now
    
    // Filter sessions by scopes if provided
    if (scopes && scopes.length > 0) {
      return this.sessions.filter(session => 
        scopes.every(scope => session.scopes.includes(scope))
      );
    }
    return this.sessions;
  }

  async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    // Show login UI
    const credentials = await this.showLoginPrompt(scopes);
    if (!credentials) {
      throw new Error('User cancelled authentication');
    }

    // Create session
    const session = await this.createSessionFromCredentials(credentials, scopes);
    
    // Store credentials securely
    await this.credentialStorage.store(session.id, credentials);
    
    // Add to sessions and notify
    this.sessions.push(session);
    this.onDidChangeSessionsEmitter.fire({ added: [session], removed: [], changed: [] });
    
    return session;
  }

  async removeSession(sessionId: string): Promise<void> {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) {
      return;
    }

    const session = this.sessions[index];
    this.sessions.splice(index, 1);
    
    // Remove from secure storage
    await this.credentialStorage.delete(sessionId);
    
    // Notify
    this.onDidChangeSessionsEmitter.fire({ added: [], removed: [session as vscode.AuthenticationSession], changed: [] });
  }

  private async showLoginPrompt(scopes: readonly string[]): Promise<ComputorCredentials | undefined> {
    void scopes; // Currently unused
    // Default to Basic Auth for backend API
    return this.promptForBasicAuth();
  }

  private async promptForBasicAuth(): Promise<ComputorCredentials | undefined> {
    const settingsManager = await this.getSettingsManager();
    const settings = await settingsManager.getSettings();
    
    // Ask for backend URL first
    const baseUrl = await vscode.window.showInputBox({
      title: 'Computor Backend URL',
      prompt: 'Enter the backend API URL',
      placeHolder: 'http://localhost:8000',
      value: settings.authentication.baseUrl
    });

    if (!baseUrl) {
      return undefined;
    }

    const username = await vscode.window.showInputBox({
      title: 'Computor Authentication',
      prompt: 'Enter your username',
      placeHolder: 'Username'
    });

    if (!username) {
      return undefined;
    }

    const password = await vscode.window.showInputBox({
      title: 'Computor Authentication',
      prompt: 'Enter your password',
      password: true,
      placeHolder: 'Password'
    });

    if (!password) {
      return undefined;
    }

    // Save the backend URL for future use
    settings.authentication.baseUrl = baseUrl;
    await settingsManager.saveSettings(settings);

    return {
      baseUrl,
      realm: 'default',
      username,
      password
    };
  }

  private async createSessionFromCredentials(
    credentials: ComputorCredentials, 
    scopes: readonly string[]
  ): Promise<ComputorAuthenticationSession> {
    const sessionId = this.generateSessionId();
    const account = {
      id: credentials.username || credentials.realm || 'default',
      label: `${credentials.username || 'Token'} @ ${credentials.realm || 'default'}`
    };

    // Create access token based on auth type
    let accessToken: string;
    if (credentials.token) {
      accessToken = credentials.token;
    } else if (credentials.username && credentials.password) {
      // For basic auth, encode credentials similar to GitLab PAT example
      const authData = {
        username: credentials.username,
        password: credentials.password,
        realm: credentials.realm,
        baseUrl: credentials.baseUrl
      };
      accessToken = Buffer.from(JSON.stringify(authData)).toString('base64');
    } else {
      throw new Error('Invalid credentials');
    }

    return {
      id: sessionId,
      accessToken,
      account,
      scopes: [...scopes],
      credentials
    };
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Check if a session needs refresh based on expiration
   */
  public async refreshSessionIfNeeded(sessionId: string): Promise<ComputorAuthenticationSession | undefined> {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return undefined;
    }
    
    // Check if credentials have an expiration date
    if (session.credentials.expiresAt) {
      const now = new Date();
      const expiryWithBuffer = new Date(session.credentials.expiresAt.getTime() - 60000); // 1 minute buffer
      
      if (now >= expiryWithBuffer) {
        // Token is expired or about to expire, need to refresh
        return this.refreshSession(session);
      }
    }
    
    return session;
  }
  
  /**
   * Refresh an expired session
   */
  private async refreshSession(session: ComputorAuthenticationSession): Promise<ComputorAuthenticationSession> {
    // For token-based auth, we can't refresh - user needs to re-authenticate
    if (session.credentials.token) {
      throw new Error('Token expired. Please re-authenticate.');
    }
    
    // For basic auth, we can generate a new session token
    if (session.credentials.username && session.credentials.password) {
      // In a real implementation, this would call the backend to get a new token
      // For now, we'll just update the expiration
      session.credentials.expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      
      // Update the stored credentials
      await this.credentialStorage.store(session.id, session.credentials);
      
      return session;
    }
    
    throw new Error('Unable to refresh session');
  }

  private async loadSessions(): Promise<void> {
    try {
      const sessionIds = await this.credentialStorage.list() || [];
      
      for (const sessionId of sessionIds) {
        const credentials = await this.credentialStorage.retrieve(sessionId);
        if (credentials) {
          // Reconstruct session
          const session: ComputorAuthenticationSession = {
            id: sessionId,
            accessToken: credentials.token || Buffer.from(JSON.stringify(credentials)).toString('base64'),
            account: {
              id: credentials.username || credentials.realm || 'default',
              label: `${credentials.username || 'Token'} @ ${credentials.realm || 'default'}`
            },
            scopes: [],
            credentials
          };
          this.sessions.push(session);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  private async getSettingsManager() {
    // Import dynamically to avoid circular dependencies
    const { ComputorSettingsManager } = await import('../settings/ComputorSettingsManager');
    return new ComputorSettingsManager(this.context);
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.onDidChangeSessionsEmitter.dispose();
  }

  // Static method to get authentication headers
  static getAuthHeaders(session: ComputorAuthenticationSession): Record<string, string> {
    const headers: Record<string, string> = {};
    const settings = session.credentials;
    
    if (settings.token) {
      // Token-based auth
      const headerName = 'Authorization'; // Could be customized from settings
      const headerPrefix = 'Bearer'; // Could be customized from settings
      headers[headerName] = headerPrefix ? `${headerPrefix} ${settings.token}` : settings.token;
    } else if (settings.username && settings.password) {
      // Basic auth - similar to GitLab PAT example
      headers['Authorization'] = `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString('base64')}`;
    }
    
    headers['Content-Type'] = 'application/json; charset=utf-8';
    return headers;
  }
}