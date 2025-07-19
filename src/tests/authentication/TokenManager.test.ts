import { expect } from 'chai';
import * as vscode from 'vscode';
import { TokenManager } from '../../authentication/TokenManager';
import { ComputorCredentialManager, TokenExpiredError } from '../../authentication/ComputorCredentialManager';
import { TokenCredentials } from '../../types/AuthenticationTypes';

// Mock VS Code extension context
class MockExtensionContext implements Partial<vscode.ExtensionContext> {
  secrets: vscode.SecretStorage;
  private storage = new Map<string, string>();
  
  constructor() {
    this.secrets = {
      get: async (key: string) => this.storage.get(key),
      store: async (key: string, value: string) => { this.storage.set(key, value); },
      delete: async (key: string) => { this.storage.delete(key); },
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    } as vscode.SecretStorage;
  }
}

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let credentialManager: ComputorCredentialManager;
  let context: MockExtensionContext;
  
  beforeEach(() => {
    context = new MockExtensionContext();
    credentialManager = new ComputorCredentialManager(context as vscode.ExtensionContext);
    tokenManager = new TokenManager(credentialManager);
  });
  
  describe('storeToken', () => {
    it('should store a simple token', async () => {
      await tokenManager.storeToken('test-profile', 'test-token-123');
      
      const token = await tokenManager.retrieveValidToken('test-profile');
      expect(token).to.equal('test-token-123');
    });
    
    it('should store token with expiration', async () => {
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      await tokenManager.storeToken('expiring-token', 'token-456', 'token', expiresAt);
      
      const token = await tokenManager.retrieveValidToken('expiring-token');
      expect(token).to.equal('token-456');
    });
    
    it('should store JWT token with refresh token', async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      await tokenManager.storeToken(
        'jwt-profile', 
        'jwt-token', 
        'jwt', 
        expiresAt, 
        'refresh-token'
      );
      
      const credentials = await credentialManager.retrieveCredentials('jwt-profile');
      expect(credentials).to.exist;
      expect(credentials!.type).to.equal('jwt');
      expect(credentials!.refreshToken).to.equal('refresh-token');
    });
  });
  
  describe('retrieveValidToken', () => {
    it('should retrieve valid token', async () => {
      await tokenManager.storeToken('valid-token', 'token-123');
      const token = await tokenManager.retrieveValidToken('valid-token');
      
      expect(token).to.equal('token-123');
    });
    
    it('should return undefined for non-existent profile', async () => {
      const token = await tokenManager.retrieveValidToken('non-existent');
      expect(token).to.be.undefined;
    });
    
    it('should throw TokenExpiredError for expired token', async () => {
      const expiresAt = new Date(Date.now() - 3600000); // 1 hour ago
      await tokenManager.storeToken('expired-token', 'old-token', 'token', expiresAt);
      
      try {
        await tokenManager.retrieveValidToken('expired-token');
        expect.fail('Should have thrown TokenExpiredError');
      } catch (error) {
        expect(error).to.be.instanceOf(TokenExpiredError);
      }
    });
    
    it('should handle token without expiration', async () => {
      await tokenManager.storeToken('no-expiry', 'eternal-token');
      const token = await tokenManager.retrieveValidToken('no-expiry');
      
      expect(token).to.equal('eternal-token');
    });
  });
  
  describe('revokeToken', () => {
    it('should revoke existing token', async () => {
      await tokenManager.storeToken('to-revoke', 'token-123');
      await tokenManager.revokeToken('to-revoke');
      
      const token = await tokenManager.retrieveValidToken('to-revoke');
      expect(token).to.be.undefined;
    });
    
    it('should handle revoking non-existent token', async () => {
      // Should not throw
      await tokenManager.revokeToken('non-existent');
    });
  });
  
  describe('listTokenProfiles', () => {
    it('should list all token profiles', async () => {
      await tokenManager.storeToken('profile1', 'token1');
      await tokenManager.storeToken('profile2', 'token2', 'jwt');
      await tokenManager.storeToken('profile3', 'token3', 'oauth', new Date());
      
      const profiles = await tokenManager.listTokenProfiles();
      
      expect(profiles).to.have.lengthOf(3);
      expect(profiles.map(p => p.profile)).to.include.members(['profile1', 'profile2', 'profile3']);
      expect(profiles.find(p => p.profile === 'profile2')?.type).to.equal('jwt');
    });
    
    it('should return empty array when no tokens stored', async () => {
      const profiles = await tokenManager.listTokenProfiles();
      expect(profiles).to.be.empty;
    });
  });
  
  describe('static methods', () => {
    it('should parse JWT expiration', () => {
      // Create a simple JWT with exp claim
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ exp: 1735689600 })).toString('base64'); // 2025-01-01
      const signature = 'fake-signature';
      const jwt = `${header}.${payload}.${signature}`;
      
      const expiration = TokenManager.parseJwtExpiration(jwt);
      expect(expiration).to.be.instanceOf(Date);
      expect(expiration?.getFullYear()).to.equal(2025);
    });
    
    it('should return undefined for invalid JWT', () => {
      expect(TokenManager.parseJwtExpiration('invalid-jwt')).to.be.undefined;
      expect(TokenManager.parseJwtExpiration('part1.part2')).to.be.undefined; // Missing third part
    });
    
    it('should generate secure token', () => {
      const token1 = TokenManager.generateSecureToken();
      const token2 = TokenManager.generateSecureToken();
      
      expect(token1).to.have.length(32);
      expect(token2).to.have.length(32);
      expect(token1).to.not.equal(token2);
    });
    
    it('should generate token with custom length', () => {
      const token = TokenManager.generateSecureToken(16);
      expect(token).to.have.length(16);
    });
  });
});