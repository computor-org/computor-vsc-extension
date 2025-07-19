import fetch from 'node-fetch';
import { HttpClient } from './HttpClient';
import { AuthenticationError } from './errors';
import { KeycloakConfig, TokenResponse } from '../types/HttpTypes';

export class JwtHttpClient extends HttpClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private keycloakConfig: KeycloakConfig;

  constructor(
    baseUrl: string,
    keycloakConfig: KeycloakConfig,
    timeout?: number,
    cacheConfig?: {
      enabled?: boolean;
      ttl?: number;
      respectCacheHeaders?: boolean;
      maxSize?: number;
    }
  ) {
    super(baseUrl, timeout, 3, 1000, cacheConfig);
    this.keycloakConfig = keycloakConfig;
  }

  async authenticate(): Promise<void> {
    try {
      const tokenResponse = await this.performOAuthFlow();
      this.setTokensFromResponse(tokenResponse);
    } catch (error) {
      if (error instanceof Error) {
        throw new AuthenticationError(`OAuth authentication failed: ${error.message}`);
      }
      throw new AuthenticationError('OAuth authentication failed with unknown error');
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      return {};
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  public async refreshAuth(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    try {
      const tokenResponse = await this.refreshAccessToken();
      this.setTokensFromResponse(tokenResponse);
    } catch (error) {
      this.clearTokens();
      if (error instanceof Error) {
        throw new AuthenticationError(`Token refresh failed: ${error.message}`);
      }
      throw new AuthenticationError('Token refresh failed with unknown error');
    }
  }

  protected async request<T>(
    method: import('../types/HttpTypes').HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<import('../types/HttpTypes').HttpResponse<T>> {
    if (this.isTokenExpired() && this.refreshToken) {
      await this.refreshAuth();
    }

    return super.request(method, endpoint, data, params);
  }

  private async performOAuthFlow(): Promise<TokenResponse> {
    // OAuth flow not implemented - requires browser interaction
    throw new Error('OAuth flow not implemented - requires browser interaction');
  }

  private async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = `${this.keycloakConfig.serverUrl}/realms/${this.keycloakConfig.realm}/protocol/openid-connect/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.keycloakConfig.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = await response.json() as any;
    
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      tokenType: tokenData.token_type,
    };
  }

  public buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.keycloakConfig.clientId,
      redirect_uri: this.keycloakConfig.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
    });

    return `${this.keycloakConfig.serverUrl}/realms/${this.keycloakConfig.realm}/protocol/openid-connect/auth?${params}`;
  }

  private setTokensFromResponse(tokenResponse: TokenResponse): void {
    this.accessToken = tokenResponse.accessToken;
    this.refreshToken = tokenResponse.refreshToken || null;
    this.tokenExpiry = tokenResponse.expiresAt;
  }

  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return false;
    }
    
    const now = new Date();
    const expiryWithBuffer = new Date(this.tokenExpiry.getTime() - 60000); // 1 minute buffer
    return now >= expiryWithBuffer;
  }

  public setTokens(accessToken: string, refreshToken?: string, expiresAt?: Date): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;
    this.tokenExpiry = expiresAt || null;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public getTokenExpiry(): Date | null {
    return this.tokenExpiry;
  }

  public logout(): void {
    this.clearTokens();
  }

  public getKeycloakConfig(): KeycloakConfig {
    return { ...this.keycloakConfig };
  }

  public setKeycloakConfig(config: KeycloakConfig): void {
    this.keycloakConfig = config;
    this.clearTokens();
  }
}