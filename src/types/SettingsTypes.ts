export interface ComputorSettings {
  version: string;
  authentication: AuthenticationSettings;
  workspace: WorkspaceSettings;
}

export interface AuthenticationSettings {
  baseUrl: string;
  defaultProvider: string;
  tokenSettings: {
    headerName: string;
    headerPrefix: string;
  };
}

export interface WorkspaceSettings {
  repositoryDirectory?: string;
  gitlabTokens: Record<string, string>; // Maps GitLab instance URL to token
}

export const defaultSettings: ComputorSettings = {
  version: '1.0.0',
  authentication: {
    baseUrl: 'http://localhost:8000',
    defaultProvider: 'token',
    tokenSettings: {
      headerName: 'X-API-Key',
      headerPrefix: ''
    }
  },
  workspace: {
    repositoryDirectory: undefined,
    gitlabTokens: {}
  }
};