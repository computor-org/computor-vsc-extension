import { expect } from 'chai';
import { JwtHttpClient } from '../../http/JwtHttpClient';
import { AuthenticationError } from '../../http/errors';
import { KeycloakConfig } from '../../types/HttpTypes';

describe('JwtHttpClient', () => {
  let client: JwtHttpClient;
  let keycloakConfig: KeycloakConfig;

  beforeEach(() => {
    keycloakConfig = {
      realm: 'test-realm',
      clientId: 'test-client',
      serverUrl: 'https://keycloak.example.com',
      redirectUri: 'http://localhost:3000/callback',
    };
    
    client = new JwtHttpClient('https://api.example.com', keycloakConfig);
  });

  describe('constructor', () => {
    it('should initialize with Keycloak config', () => {
      const config = client.getKeycloakConfig();
      expect(config).to.deep.equal(keycloakConfig);
    });

    it('should initialize with no tokens', () => {
      expect(client.getAccessToken()).to.be.null;
      expect(client.getRefreshToken()).to.be.null;
      expect(client.getTokenExpiry()).to.be.null;
    });
  });

  describe('authentication state', () => {
    it('should return false when not authenticated', () => {
      expect(client.isAuthenticated()).to.be.false;
    });

    it('should return false when token is expired', () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      client.setTokens('access-token', 'refresh-token', expiredDate);
      expect(client.isAuthenticated()).to.be.false;
    });

    it('should return true when token is valid', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      client.setTokens('access-token', 'refresh-token', futureDate);
      expect(client.isAuthenticated()).to.be.true;
    });
  });

  describe('auth headers', () => {
    it('should return empty headers when no token', () => {
      const headers = client.getAuthHeaders();
      expect(headers).to.be.empty;
    });

    it('should return Bearer token header when token exists', () => {
      client.setTokens('access-token-123');
      const headers = client.getAuthHeaders();
      expect(headers['Authorization']).to.equal('Bearer access-token-123');
    });
  });

  describe('token management', () => {
    it('should set tokens correctly', () => {
      const accessToken = 'access-token-123';
      const refreshToken = 'refresh-token-456';
      const expiresAt = new Date(Date.now() + 3600000);

      client.setTokens(accessToken, refreshToken, expiresAt);

      expect(client.getAccessToken()).to.equal(accessToken);
      expect(client.getRefreshToken()).to.equal(refreshToken);
      expect(client.getTokenExpiry()).to.equal(expiresAt);
    });

    it('should handle optional refresh token and expiry', () => {
      const accessToken = 'access-token-123';
      
      client.setTokens(accessToken);

      expect(client.getAccessToken()).to.equal(accessToken);
      expect(client.getRefreshToken()).to.be.null;
      expect(client.getTokenExpiry()).to.be.null;
    });

    it('should clear tokens on logout', () => {
      client.setTokens('access-token', 'refresh-token', new Date());
      client.logout();

      expect(client.getAccessToken()).to.be.null;
      expect(client.getRefreshToken()).to.be.null;
      expect(client.getTokenExpiry()).to.be.null;
    });
  });

  describe('token expiration', () => {
    it('should detect expired tokens', () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      client.setTokens('access-token', 'refresh-token', expiredDate);
      expect(client['isTokenExpired']()).to.be.true;
    });

    it('should detect tokens expiring soon (within buffer)', () => {
      const soonExpiredDate = new Date(Date.now() + 30000); // 30 seconds from now
      client.setTokens('access-token', 'refresh-token', soonExpiredDate);
      expect(client['isTokenExpired']()).to.be.true;
    });

    it('should not detect valid tokens as expired', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      client.setTokens('access-token', 'refresh-token', futureDate);
      expect(client['isTokenExpired']()).to.be.false;
    });

    it('should not detect tokens without expiry as expired', () => {
      client.setTokens('access-token', 'refresh-token');
      expect(client['isTokenExpired']()).to.be.false;
    });
  });

  describe('configuration', () => {
    it('should update Keycloak config', () => {
      const newConfig: KeycloakConfig = {
        realm: 'new-realm',
        clientId: 'new-client',
        serverUrl: 'https://new-keycloak.example.com',
        redirectUri: 'http://localhost:4000/callback',
      };

      client.setKeycloakConfig(newConfig);
      expect(client.getKeycloakConfig()).to.deep.equal(newConfig);
    });

    it('should clear tokens when config changes', () => {
      client.setTokens('access-token', 'refresh-token');
      
      const newConfig: KeycloakConfig = {
        realm: 'new-realm',
        clientId: 'new-client',
        serverUrl: 'https://new-keycloak.example.com',
        redirectUri: 'http://localhost:4000/callback',
      };

      client.setKeycloakConfig(newConfig);
      
      expect(client.getAccessToken()).to.be.null;
      expect(client.getRefreshToken()).to.be.null;
    });
  });

  describe('refresh token handling', () => {
    it('should throw error when no refresh token available', async () => {
      try {
        await client.refreshAuth();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect(error.message).to.equal('No refresh token available');
      }
    });

    it('should clear tokens on refresh failure', async () => {
      client.setTokens('access-token', 'refresh-token');
      
      // Mock failed refresh by overriding the private method
      (client as any).refreshAccessToken = async () => {
        throw new Error('Refresh failed');
      };

      try {
        await client.refreshAuth();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect(client.getAccessToken()).to.be.null;
        expect(client.getRefreshToken()).to.be.null;
      }
    });
  });

  describe('OAuth flow', () => {
    it('should throw error for unimplemented OAuth flow', async () => {
      try {
        await client.authenticate();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        expect(error.message).to.include('OAuth flow not implemented');
      }
    });
  });

  describe('URL building', () => {
    it('should build correct auth URL', () => {
      const authUrl = client['buildAuthUrl']();
      const expectedBase = `${keycloakConfig.serverUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/auth`;
      
      expect(authUrl).to.include(expectedBase);
      expect(authUrl).to.include(`client_id=${keycloakConfig.clientId}`);
      expect(authUrl).to.include(`redirect_uri=${encodeURIComponent(keycloakConfig.redirectUri)}`);
      expect(authUrl).to.include('response_type=code');
      expect(authUrl).to.include('scope=openid%20profile%20email');
    });
  });
});