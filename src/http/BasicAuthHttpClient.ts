import { HttpClient } from './HttpClient';
import { AuthenticationError } from './errors';

export class BasicAuthHttpClient extends HttpClient {
  private username: string;
  private password: string;
  private isAuth: boolean = false;

  constructor(baseUrl: string, username: string, password: string, timeout?: number) {
    super(baseUrl, timeout);
    this.username = username;
    this.password = password;
  }

  async authenticate(): Promise<void> {
    if (!this.username || !this.password) {
      throw new AuthenticationError('Username and password are required');
    }

    try {
      await this.get('/auth/validate');
      this.isAuth = true;
    } catch (error) {
      this.isAuth = false;
      if (error instanceof Error) {
        throw new AuthenticationError(`Authentication failed: ${error.message}`);
      }
      throw new AuthenticationError('Authentication failed with unknown error');
    }
  }

  isAuthenticated(): boolean {
    return this.isAuth;
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.username || !this.password) {
      return {};
    }

    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
    };
  }

  public setCredentials(username: string, password: string): void {
    this.username = username;
    this.password = password;
    this.isAuth = false;
  }

  public getUsername(): string {
    return this.username;
  }
}