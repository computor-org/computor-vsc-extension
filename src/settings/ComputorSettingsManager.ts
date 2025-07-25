import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { JsonSettingsStorage } from './JsonSettingsStorage';
import { VscodeSecureStorage } from './VscodeSecureStorage';
import { ComputorSettings, defaultSettings } from '../types/SettingsTypes';

export class ComputorJsonSettingsStorage extends JsonSettingsStorage<ComputorSettings> {
  protected getDefaultSettings(): ComputorSettings {
    return defaultSettings;
  }
  
  protected async migrate(oldVersion: number, newVersion: number): Promise<void> {
    // Implement migration logic here when needed
    // Parameters will be used when migration is implemented
    void oldVersion;
    void newVersion;
  }
}

export class ComputorSettingsManager {
  private settingsStorage: ComputorJsonSettingsStorage;
  private secureStorage: VscodeSecureStorage;
  
  constructor(context: vscode.ExtensionContext) {
    const settingsPath = path.join(os.homedir(), '.computor', 'config.json');
    this.settingsStorage = new ComputorJsonSettingsStorage(settingsPath);
    this.secureStorage = new VscodeSecureStorage(context.secrets);
  }
  
  async getSettings(): Promise<ComputorSettings> {
    return await this.settingsStorage.load();
  }
  
  async saveSettings(settings: ComputorSettings): Promise<void> {
    await this.settingsStorage.save(settings);
  }
  
  async getBaseUrl(): Promise<string> {
    const settings = await this.settingsStorage.load();
    return settings.authentication.baseUrl;
  }
  
  async setBaseUrl(url: string): Promise<void> {
    const settings = await this.settingsStorage.load();
    settings.authentication.baseUrl = url;
    await this.settingsStorage.save(settings);
  }
  
  async getAuthProvider(): Promise<string> {
    const settings = await this.settingsStorage.load();
    return settings.authentication.defaultProvider;
  }
  
  async setAuthProvider(provider: string): Promise<void> {
    const settings = await this.settingsStorage.load();
    settings.authentication.defaultProvider = provider;
    await this.settingsStorage.save(settings);
  }
  
  async getTokenSettings(): Promise<{ headerName: string; headerPrefix: string }> {
    const settings = await this.settingsStorage.load();
    return settings.authentication.tokenSettings;
  }
  
  async setTokenSettings(tokenSettings: { headerName: string; headerPrefix: string }): Promise<void> {
    const settings = await this.settingsStorage.load();
    settings.authentication.tokenSettings = tokenSettings;
    await this.settingsStorage.save(settings);
  }
  
  async storeSecureToken(key: string, token: string): Promise<void> {
    await this.secureStorage.store(key, token);
  }
  
  async retrieveSecureToken(key: string): Promise<string | undefined> {
    return await this.secureStorage.retrieve(key);
  }
  
  async deleteSecureToken(key: string): Promise<void> {
    await this.secureStorage.delete(key);
  }
  
  async clearSettings(): Promise<void> {
    await this.settingsStorage.clear();
  }
  
  async settingsExist(): Promise<boolean> {
    return await this.settingsStorage.exists();
  }
}