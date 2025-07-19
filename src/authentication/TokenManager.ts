import { 
  TokenCredentials, 
  JwtCredentials, 
  OAuthCredentials,
  LoginCredentials 
} from '../types/AuthenticationTypes';
import { ComputorCredentialManager, TokenExpiredError } from './ComputorCredentialManager';

export class TokenManager {
  constructor(private credentialManager: ComputorCredentialManager) {}

  async storeToken(
    profileName: string, 
    token: string, 
    type: 'token' | 'jwt' | 'oauth' = 'token',
    expiresAt?: Date,
    refreshToken?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const credentials: TokenCredentials | JwtCredentials | OAuthCredentials = {
      type,
      token,
      expiresAt,
      refreshToken,
      metadata: {
        ...metadata,
        storedAt: new Date().toISOString()
      }
    };
    
    await this.credentialManager.storeCredentials(profileName, credentials);
  }

  async retrieveValidToken(profileName: string): Promise<string | undefined> {
    const credentials = await this.credentialManager.retrieveCredentials(profileName);
    
    if (!credentials || !this.isTokenCredential(credentials)) {
      return undefined;
    }
    
    // Check token expiration
    if (this.isTokenExpired(credentials)) {
      // Try to refresh if possible
      if (credentials.refreshToken && (credentials.type === 'jwt' || credentials.type === 'oauth')) {
        try {
          return await this.refreshToken(profileName, credentials as JwtCredentials | OAuthCredentials);
        } catch (error) {
          console.error('Token refresh failed:', error);
          await this.credentialManager.deleteCredentials(profileName);
          throw new TokenExpiredError();
        }
      } else {
        await this.credentialManager.deleteCredentials(profileName);
        throw new TokenExpiredError();
      }
    }
    
    return credentials.token;
  }

  async refreshToken(profileName: string, credentials: JwtCredentials | OAuthCredentials): Promise<string> {
    if (!credentials.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    // In a real implementation, this would call the authentication endpoint
    // For now, we'll throw an error indicating it needs to be implemented
    throw new Error('Token refresh not implemented - requires authentication endpoint');
    
    // Example implementation:
    // const response = await this.performTokenRefresh(credentials.refreshToken);
    // await this.storeToken(
    //   profileName, 
    //   response.accessToken, 
    //   credentials.type,
    //   response.expiresAt,
    //   response.refreshToken || credentials.refreshToken,
    //   credentials.metadata
    // );
    // return response.accessToken;
  }

  async revokeToken(profileName: string): Promise<void> {
    const credentials = await this.credentialManager.retrieveCredentials(profileName);
    
    if (credentials && this.isTokenCredential(credentials)) {
      // In a real implementation, this might call a revocation endpoint
      // For now, we just delete the stored credentials
      await this.credentialManager.deleteCredentials(profileName);
    }
  }

  async listTokenProfiles(): Promise<Array<{ profile: string; type: string; expiresAt?: Date }>> {
    const profiles = await this.credentialManager.listStoredProfiles();
    const tokenProfiles: Array<{ profile: string; type: string; expiresAt?: Date }> = [];
    
    for (const profile of profiles) {
      const credentials = await this.credentialManager.retrieveCredentials(profile);
      if (credentials && this.isTokenCredential(credentials)) {
        tokenProfiles.push({
          profile,
          type: credentials.type,
          expiresAt: credentials.expiresAt
        });
      }
    }
    
    return tokenProfiles;
  }

  private isTokenCredential(
    credentials: LoginCredentials
  ): credentials is TokenCredentials | JwtCredentials | OAuthCredentials {
    return ['token', 'jwt', 'oauth'].includes(credentials.type) && !!credentials.token;
  }

  private isTokenExpired(credentials: LoginCredentials): boolean {
    if (!credentials.expiresAt) {
      return false;
    }
    
    const expiresAt = credentials.expiresAt instanceof Date 
      ? credentials.expiresAt 
      : new Date(credentials.expiresAt);
    
    // Add a small buffer (5 minutes) to account for clock skew
    const bufferMs = 5 * 60 * 1000;
    return new Date().getTime() >= (expiresAt.getTime() - bufferMs);
  }

  // Helper to parse JWT and extract expiration
  static parseJwtExpiration(token: string): Date | undefined {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return undefined;
      }
      
      const payloadPart = parts[1];
      if (!payloadPart) {
        return undefined;
      }
      
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
      if (payload.exp) {
        return new Date(payload.exp * 1000);
      }
      
      return undefined;
    } catch {
      return undefined;
    }
  }

  // Helper to generate secure tokens
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      token += chars[randomIndex];
    }
    
    return token;
  }
}