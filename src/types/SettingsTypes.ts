export interface ComputorSettings {
  version: string;
  authentication: AuthenticationSettings;
}

export interface AuthenticationSettings {
  baseUrl: string;
  defaultProvider: string;
  tokenSettings: {
    headerName: string;
    headerPrefix: string;
  };
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
  }
};