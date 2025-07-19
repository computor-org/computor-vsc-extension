import { expect } from 'chai';
import * as vscode from 'vscode';
import { VscodeCredentialStorage } from '../../src/authentication/VscodeCredentialStorage';
import { ComputorCredentials } from '../../src/types/AuthenticationTypes';
import { MockExtensionContext } from '../helpers/MockExtensionContext';

describe('VscodeCredentialStorage', () => {
  let storage: VscodeCredentialStorage;
  let context: MockExtensionContext;
  
  beforeEach(() => {
    context = new MockExtensionContext();
    storage = new VscodeCredentialStorage(context as vscode.ExtensionContext);
  });
  
  describe('store/retrieve', () => {
    it('should store and retrieve credentials', async () => {
      const credentials: ComputorCredentials = {
        baseUrl: 'https://api.example.com',
        realm: 'test',
        token: 'test-token-123'
      };
      
      await storage.store('test-key', credentials);
      const retrieved = await storage.retrieve('test-key');
      
      expect(retrieved).to.deep.equal(credentials);
    });
    
    it('should return undefined for non-existent key', async () => {
      const retrieved = await storage.retrieve('non-existent');
      expect(retrieved).to.be.undefined;
    });
    
    it('should handle credentials with all fields', async () => {
      const credentials: ComputorCredentials = {
        baseUrl: 'https://api.example.com',
        realm: 'production',
        username: 'testuser',
        password: 'testpass',
        token: 'test-token',
        expiresAt: new Date('2025-12-31')
      };
      
      await storage.store('full-creds', credentials);
      const retrieved = await storage.retrieve('full-creds');
      
      expect(retrieved).to.deep.equal(credentials);
    });
  });
  
  describe('delete', () => {
    it('should delete stored credentials', async () => {
      const credentials: ComputorCredentials = {
        baseUrl: 'https://api.example.com',
        token: 'test-token'
      };
      
      await storage.store('to-delete', credentials);
      await storage.delete('to-delete');
      
      const retrieved = await storage.retrieve('to-delete');
      expect(retrieved).to.be.undefined;
    });
  });
  
  describe('list', () => {
    it('should list all stored keys', async () => {
      await storage.store('key1', { baseUrl: 'url1', token: 'token1' });
      await storage.store('key2', { baseUrl: 'url2', token: 'token2' });
      await storage.store('key3', { baseUrl: 'url3', token: 'token3' });
      
      const keys = await storage.list();
      expect(keys).to.have.lengthOf(3);
      expect(keys).to.include.members(['key1', 'key2', 'key3']);
    });
    
    it('should return empty array when no keys stored', async () => {
      const keys = await storage.list();
      expect(keys).to.be.an('array').that.is.empty;
    });
  });
  
  describe('clear', () => {
    it('should clear all stored credentials', async () => {
      await storage.store('key1', { baseUrl: 'url1', token: 'token1' });
      await storage.store('key2', { baseUrl: 'url2', token: 'token2' });
      
      await storage.clear();
      
      const keys = await storage.list();
      expect(keys).to.be.empty;
      
      const retrieved1 = await storage.retrieve('key1');
      const retrieved2 = await storage.retrieve('key2');
      expect(retrieved1).to.be.undefined;
      expect(retrieved2).to.be.undefined;
    });
  });
});