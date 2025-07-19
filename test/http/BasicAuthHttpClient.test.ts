import { expect } from 'chai';
import { BasicAuthHttpClient } from '../../src/http/BasicAuthHttpClient';
import { AuthenticationError } from '../../src/http/errors';

describe('BasicAuthHttpClient', () => {
  let client: BasicAuthHttpClient;

  beforeEach(() => {
    client = new BasicAuthHttpClient('https://api.example.com', 'testuser', 'testpass');
  });

  describe('constructor', () => {
    it('should initialize with credentials', () => {
      expect(client.getUsername()).to.equal('testuser');
      expect(client.isAuthenticated()).to.be.false;
    });
  });

  describe('authentication', () => {
    it('should throw error when credentials are missing', async () => {
      const clientWithoutCreds = new BasicAuthHttpClient('https://api.example.com', '', '');
      
      try {
        await clientWithoutCreds.authenticate();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        if (error instanceof Error) {
          expect(error.message).to.equal('Username and password are required');
        }
      }
    });

    it('should set authenticated state after successful authentication', async () => {
      // Mock successful authentication by overriding the get method
      // @ts-ignore - mocking for test
      client.get = async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} });
      
      await client.authenticate();
      expect(client.isAuthenticated()).to.be.true;
    });

    it('should handle authentication failure', async () => {
      // Mock failed authentication
      // @ts-ignore - mocking for test
      client.get = async () => {
        throw new Error('Unauthorized');
      };

      try {
        await client.authenticate();
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
        if (error instanceof Error) {
          expect(error.message).to.include('Authentication failed');
        }
        expect(client.isAuthenticated()).to.be.false;
      }
    });
  });

  describe('auth headers', () => {
    it('should generate correct Basic auth header', () => {
      const headers = client.getAuthHeaders();
      const expectedCredentials = Buffer.from('testuser:testpass').toString('base64');
      expect(headers['Authorization']).to.equal(`Basic ${expectedCredentials}`);
    });

    it('should return empty headers when credentials are missing', () => {
      const clientWithoutCreds = new BasicAuthHttpClient('https://api.example.com', '', '');
      const headers = clientWithoutCreds.getAuthHeaders();
      expect(headers).to.be.empty;
    });
  });

  describe('credential management', () => {
    it('should update credentials', () => {
      client.setCredentials('newuser', 'newpass');
      expect(client.getUsername()).to.equal('newuser');
      expect(client.isAuthenticated()).to.be.false;
    });

    it('should update auth headers after credential change', () => {
      client.setCredentials('newuser', 'newpass');
      const headers = client.getAuthHeaders();
      const expectedCredentials = Buffer.from('newuser:newpass').toString('base64');
      expect(headers['Authorization']).to.equal(`Basic ${expectedCredentials}`);
    });
  });

  describe('special characters in credentials', () => {
    it('should handle special characters in username and password', () => {
      const specialUser = 'user@domain.com';
      const specialPass = 'pass$word!123';
      
      client.setCredentials(specialUser, specialPass);
      const headers = client.getAuthHeaders();
      const expectedCredentials = Buffer.from(`${specialUser}:${specialPass}`).toString('base64');
      expect(headers['Authorization']).to.equal(`Basic ${expectedCredentials}`);
    });

    it('should handle unicode characters', () => {
      const unicodeUser = 'üser';
      const unicodePass = 'pässwörd';
      
      client.setCredentials(unicodeUser, unicodePass);
      const headers = client.getAuthHeaders();
      const expectedCredentials = Buffer.from(`${unicodeUser}:${unicodePass}`).toString('base64');
      expect(headers['Authorization']).to.equal(`Basic ${expectedCredentials}`);
    });
  });
});