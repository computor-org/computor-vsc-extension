import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { JsonSettingsStorage } from '../../src/settings/JsonSettingsStorage';
import { ComputorSettings, defaultSettings } from '../../src/types/SettingsTypes';

class TestJsonSettingsStorage extends JsonSettingsStorage<ComputorSettings> {
  protected getDefaultSettings(): ComputorSettings {
    return defaultSettings;
  }
  
  protected async migrate(oldVersion: number, newVersion: number): Promise<void> {
    // Test implementation
    void oldVersion;
    void newVersion;
  }
}

describe('JsonSettingsStorage', () => {
  let storage: TestJsonSettingsStorage;
  let testFilePath: string;
  
  beforeEach(async () => {
    testFilePath = path.join(os.tmpdir(), 'computor-test', `test-${Date.now()}.json`);
    storage = new TestJsonSettingsStorage(testFilePath);
  });
  
  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
      await fs.rmdir(path.dirname(testFilePath));
    } catch {
      // Ignore cleanup errors
    }
  });
  
  describe('load', () => {
    it('should create default settings if file does not exist', async () => {
      const settings = await storage.load();
      expect(settings).to.deep.equal(defaultSettings);
      
      const fileExists = await storage.exists();
      expect(fileExists).to.be.true;
    });
    
    it('should load existing settings from file', async () => {
      const customSettings: ComputorSettings = {
        ...defaultSettings,
        authentication: {
          ...defaultSettings.authentication,
          baseUrl: 'https://custom.example.com'
        }
      };
      
      await storage.save(customSettings);
      const loadedSettings = await storage.load();
      
      expect(loadedSettings.authentication.baseUrl).to.equal('https://custom.example.com');
    });
    
    it('should return default settings on parse error', async () => {
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, 'invalid json');
      
      const settings = await storage.load();
      expect(settings).to.deep.equal(defaultSettings);
    });
  });
  
  describe('save', () => {
    it('should save settings to file', async () => {
      const settings: ComputorSettings = {
        ...defaultSettings,
        authentication: {
          ...defaultSettings.authentication,
          defaultProvider: 'oauth'
        }
      };
      
      await storage.save(settings);
      
      const fileContent = await fs.readFile(testFilePath, 'utf8');
      const savedSettings = JSON.parse(fileContent);
      
      expect(savedSettings.authentication.defaultProvider).to.equal('oauth');
    });
    
    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(os.tmpdir(), 'computor-test', 'nested', 'deep', 'test.json');
      const nestedStorage = new TestJsonSettingsStorage(nestedPath);
      
      await nestedStorage.save(defaultSettings);
      
      const exists = await nestedStorage.exists();
      expect(exists).to.be.true;
      
      // Cleanup
      await fs.unlink(nestedPath);
      await fs.rmdir(path.dirname(nestedPath));
    });
  });
  
  describe('get/set', () => {
    it('should get and set individual settings', async () => {
      await storage.set('version', '2.0.0');
      const version = await storage.get('version');
      
      expect(version).to.equal('2.0.0');
    });
    
    it('should cache values after get', async () => {
      await storage.save(defaultSettings);
      
      const version1 = await storage.get('version');
      
      // Modify file directly
      const settings = JSON.parse(await fs.readFile(testFilePath, 'utf8'));
      settings.version = '3.0.0';
      await fs.writeFile(testFilePath, JSON.stringify(settings));
      
      // Should return cached value
      const version2 = await storage.get('version');
      expect(version2).to.equal(version1);
    });
  });
  
  describe('delete', () => {
    it('should delete a key from settings', async () => {
      await storage.save(defaultSettings);
      await storage.delete('version');
      
      const settings = await storage.load();
      expect(settings.version).to.be.undefined;
    });
  });
  
  describe('exists', () => {
    it('should return false if file does not exist', async () => {
      const exists = await storage.exists();
      expect(exists).to.be.false;
    });
    
    it('should return true if file exists', async () => {
      await storage.save(defaultSettings);
      const exists = await storage.exists();
      expect(exists).to.be.true;
    });
  });
  
  describe('clear', () => {
    it('should reset settings to default', async () => {
      const customSettings: ComputorSettings = {
        ...defaultSettings,
        version: '5.0.0'
      };
      
      await storage.save(customSettings);
      await storage.clear();
      
      const settings = await storage.load();
      expect(settings).to.deep.equal(defaultSettings);
    });
  });
});