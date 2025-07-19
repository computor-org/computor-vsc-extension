import { expect } from 'chai';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ComputorSettingsManager } from '../../settings/ComputorSettingsManager';
import { defaultSettings } from '../../types/SettingsTypes';

// Mock VS Code extension context
class MockExtensionContext implements Partial<vscode.ExtensionContext> {
  secrets: vscode.SecretStorage;
  
  constructor() {
    const storage = new Map<string, string>();
    this.secrets = {
      get: async (key: string) => storage.get(key),
      store: async (key: string, value: string) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    } as vscode.SecretStorage;
  }
}

describe('ComputorSettingsManager', () => {
  let manager: ComputorSettingsManager;
  let context: MockExtensionContext;
  let settingsPath: string;
  
  beforeEach(async () => {
    context = new MockExtensionContext();
    manager = new ComputorSettingsManager(context as vscode.ExtensionContext);
    settingsPath = path.join(os.homedir(), '.computor', 'config.json');
  });
  
  afterEach(async () => {
    try {
      await fs.unlink(settingsPath);
      await fs.rmdir(path.dirname(settingsPath));
    } catch {
      // Ignore cleanup errors
    }
  });
  
  describe('getSettings/saveSettings', () => {
    it('should get and save settings', async () => {
      const settings = await manager.getSettings();
      expect(settings).to.deep.equal(defaultSettings);
      
      const modifiedSettings = {
        ...settings,
        version: '2.0.0'
      };
      
      await manager.saveSettings(modifiedSettings);
      const loadedSettings = await manager.getSettings();
      
      expect(loadedSettings.version).to.equal('2.0.0');
    });
  });
  
  describe('getBaseUrl/setBaseUrl', () => {
    it('should get and set base URL', async () => {
      const defaultUrl = await manager.getBaseUrl();
      expect(defaultUrl).to.equal('http://localhost:8000');
      
      await manager.setBaseUrl('https://api.example.com');
      const newUrl = await manager.getBaseUrl();
      
      expect(newUrl).to.equal('https://api.example.com');
    });
  });
  
  describe('getAuthProvider/setAuthProvider', () => {
    it('should get and set auth provider', async () => {
      const defaultProvider = await manager.getAuthProvider();
      expect(defaultProvider).to.equal('token');
      
      await manager.setAuthProvider('oauth');
      const newProvider = await manager.getAuthProvider();
      
      expect(newProvider).to.equal('oauth');
    });
  });
  
  describe('getTokenSettings/setTokenSettings', () => {
    it('should get and set token settings', async () => {
      const defaultSettings = await manager.getTokenSettings();
      expect(defaultSettings).to.deep.equal({
        headerName: 'X-API-Key',
        headerPrefix: ''
      });
      
      const newSettings = {
        headerName: 'Authorization',
        headerPrefix: 'Bearer'
      };
      
      await manager.setTokenSettings(newSettings);
      const loadedSettings = await manager.getTokenSettings();
      
      expect(loadedSettings).to.deep.equal(newSettings);
    });
  });
  
  describe('secure token operations', () => {
    it('should store and retrieve secure tokens', async () => {
      await manager.storeSecureToken('api-key', 'secret-value');
      const retrieved = await manager.retrieveSecureToken('api-key');
      
      expect(retrieved).to.equal('secret-value');
    });
    
    it('should delete secure tokens', async () => {
      await manager.storeSecureToken('api-key', 'secret-value');
      await manager.deleteSecureToken('api-key');
      
      const retrieved = await manager.retrieveSecureToken('api-key');
      expect(retrieved).to.be.undefined;
    });
  });
  
  describe('clearSettings', () => {
    it('should reset settings to default', async () => {
      await manager.setBaseUrl('https://custom.example.com');
      await manager.clearSettings();
      
      const settings = await manager.getSettings();
      expect(settings).to.deep.equal(defaultSettings);
    });
  });
  
  describe('settingsExist', () => {
    it('should check if settings file exists', async () => {
      const existsBefore = await manager.settingsExist();
      expect(existsBefore).to.be.false;
      
      await manager.getSettings(); // This creates the file
      
      const existsAfter = await manager.settingsExist();
      expect(existsAfter).to.be.true;
    });
  });
});