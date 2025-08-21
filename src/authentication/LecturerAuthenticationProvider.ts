import * as vscode from 'vscode';
import { 
  ComputorCredentials, 
  ComputorAuthenticationSession,
  AuthenticationProviderOptions
} from '../types/AuthenticationTypes';
import { VscodeCredentialStorage } from './VscodeCredentialStorage';

export class LecturerAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
  private static readonly PROVIDER_ID = 'computor-lecturer';
  private static readonly PROVIDER_LABEL = 'Computor Lecturer';
  
  private sessions: ComputorAuthenticationSession[] = [];
  private onDidChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this.onDidChangeSessionsEmitter.event;
  
  private credentialStorage: VscodeCredentialStorage;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly options: AuthenticationProviderOptions = {}
  ) {
    this.credentialStorage = new VscodeCredentialStorage(context, 'lecturer');
    
    // Register the authentication provider
    this.disposables.push(
      vscode.authentication.registerAuthenticationProvider(
        LecturerAuthenticationProvider.PROVIDER_ID,
        this.options.label || LecturerAuthenticationProvider.PROVIDER_LABEL,
        this,
        { supportsMultipleAccounts: this.options.supportsMultipleAccounts ?? false }
      )
    );
    
    // Load existing sessions
    this.loadSessions();
  }

  async getSessions(scopes?: readonly string[], options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
    void options;
    
    if (scopes && scopes.length > 0) {
      return this.sessions.filter(session => 
        scopes.every(scope => session.scopes.includes(scope))
      );
    }
    return this.sessions;
  }

  async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    const credentials = await this.showLecturerLoginPrompt(scopes);
    if (!credentials) {
      throw new Error('User cancelled lecturer authentication');
    }

    const session = await this.createSessionFromCredentials(credentials, scopes);
    
    await this.credentialStorage.store(session.id, credentials);
    
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
    
    await this.credentialStorage.delete(sessionId);
    
    this.onDidChangeSessionsEmitter.fire({ added: [], removed: [session as vscode.AuthenticationSession], changed: [] });
  }

  private async showLecturerLoginPrompt(scopes: readonly string[]): Promise<ComputorCredentials | undefined> {
    void scopes;
    
    const settingsManager = await this.getSettingsManager();
    const settings = await settingsManager.getSettings();
    
    // Show lecturer-specific login dialog
    const baseUrl = await vscode.window.showInputBox({
      title: 'Computor Lecturer Authentication',
      prompt: 'Enter the backend API URL for lecturers',
      placeHolder: 'http://localhost:8000',
      value: settings.authentication.baseUrl,
      ignoreFocusOut: true
    });

    if (!baseUrl) {
      return undefined;
    }

    const username = await vscode.window.showInputBox({
      title: 'Lecturer Login',
      prompt: 'Enter your lecturer username',
      placeHolder: 'Username',
      ignoreFocusOut: true
    });

    if (!username) {
      return undefined;
    }

    const password = await vscode.window.showInputBox({
      title: 'Lecturer Login',
      prompt: 'Enter your lecturer password',
      password: true,
      placeHolder: 'Password',
      ignoreFocusOut: true
    });

    if (!password) {
      return undefined;
    }

    // Save the backend URL for future use
    settings.authentication.baseUrl = baseUrl;
    await settingsManager.saveSettings(settings);

    return {
      baseUrl,
      realm: 'lecturer',
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
      id: `lecturer-${credentials.username}`,
      label: `Lecturer: ${credentials.username} @ ${credentials.realm || 'default'}`
    };

    let accessToken: string;
    if (credentials.token) {
      accessToken = credentials.token;
    } else if (credentials.username && credentials.password) {
      const authData = {
        username: credentials.username,
        password: credentials.password,
        realm: credentials.realm || 'lecturer',
        baseUrl: credentials.baseUrl,
        role: 'lecturer'
      };
      accessToken = Buffer.from(JSON.stringify(authData)).toString('base64');
    } else {
      throw new Error('Invalid lecturer credentials');
    }

    return {
      id: sessionId,
      accessToken,
      account,
      scopes: [...scopes],
      credentials: {
        ...credentials,
        realm: credentials.realm || 'lecturer'
      }
    };
  }

  private generateSessionId(): string {
    return `lecturer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  public async refreshSessionIfNeeded(sessionId: string): Promise<ComputorAuthenticationSession | undefined> {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return undefined;
    }
    
    if (session.credentials.expiresAt) {
      const now = new Date();
      const expiryWithBuffer = new Date(session.credentials.expiresAt.getTime() - 60000);
      
      if (now >= expiryWithBuffer) {
        return this.refreshSession(session);
      }
    }
    
    return session;
  }
  
  private async refreshSession(session: ComputorAuthenticationSession): Promise<ComputorAuthenticationSession> {
    if (session.credentials.token) {
      throw new Error('Lecturer token expired. Please re-authenticate.');
    }
    
    if (session.credentials.username && session.credentials.password) {
      session.credentials.expiresAt = new Date(Date.now() + 3600000);
      await this.credentialStorage.store(session.id, session.credentials);
      return session;
    }
    
    throw new Error('Unable to refresh lecturer session');
  }

  private async loadSessions(): Promise<void> {
    try {
      const sessionIds = await this.credentialStorage.list() || [];
      
      for (const sessionId of sessionIds) {
        const credentials = await this.credentialStorage.retrieve(sessionId);
        if (credentials) {
          const session: ComputorAuthenticationSession = {
            id: sessionId,
            accessToken: credentials.token || Buffer.from(JSON.stringify(credentials)).toString('base64'),
            account: {
              id: `lecturer-${credentials.username || credentials.realm || 'default'}`,
              label: `Lecturer: ${credentials.username || 'Token'} @ ${credentials.realm || 'default'}`
            },
            scopes: [],
            credentials: {
              ...credentials,
              realm: credentials.realm || 'lecturer'
            }
          };
          this.sessions.push(session);
        }
      }
    } catch (error) {
      console.error('Failed to load lecturer sessions:', error);
    }
  }

  private async getSettingsManager() {
    const { ComputorSettingsManager } = await import('../settings/ComputorSettingsManager');
    return new ComputorSettingsManager(this.context);
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.onDidChangeSessionsEmitter.dispose();
  }

  static getAuthHeaders(session: ComputorAuthenticationSession): Record<string, string> {
    const headers: Record<string, string> = {};
    const settings = session.credentials;
    
    if (settings.token) {
      headers['Authorization'] = `Bearer ${settings.token}`;
    } else if (settings.username && settings.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString('base64')}`;
    }
    
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['X-User-Role'] = 'lecturer';
    return headers;
  }

  static getProviderId(): string {
    return LecturerAuthenticationProvider.PROVIDER_ID;
  }
}