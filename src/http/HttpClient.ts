import fetch, { Response, Headers } from 'node-fetch';
import { HttpMethod, HttpResponse, HttpRequestConfig, RequestInterceptor, ResponseInterceptor } from '../types/HttpTypes';
import { HttpError, NetworkError, TimeoutError, ValidationError } from './errors';

export abstract class HttpClient {
  protected baseUrl: string;
  protected timeout: number;
  protected headers: Record<string, string>;
  protected maxRetries: number;
  protected retryDelay: number;
  protected requestInterceptors: RequestInterceptor[] = [];
  protected responseInterceptors: ResponseInterceptor[] = [];

  constructor(baseUrl: string, timeout: number = 5000, maxRetries: number = 3, retryDelay: number = 1000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'computor-vsc-extension',
    };
  }

  abstract authenticate(): Promise<void>;
  abstract isAuthenticated(): boolean;
  abstract getAuthHeaders(): Record<string, string>;

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, params);
  }

  async post<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('POST', endpoint, data, params);
  }

  async put<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', endpoint, data, params);
  }

  async delete<T>(endpoint: string, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, params);
  }

  async patch<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', endpoint, data, params);
  }

  protected async request<T>(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpResponse<T>> {
    const config = await this.buildRequestConfig(method, endpoint, data, params);
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(config);
      } catch (error) {
        if (attempt === this.maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  private async buildRequestConfig(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpRequestConfig> {
    const url = this.buildUrl(endpoint, params);
    const headers = { ...this.headers, ...this.getAuthHeaders() };

    let config: HttpRequestConfig = {
      method,
      url,
      headers,
      data,
      params,
      timeout: this.timeout,
    };

    for (const interceptor of this.requestInterceptors) {
      config = await interceptor.onRequest(config);
    }

    this.validateRequest(config);
    return config;
  }

  private async executeRequest<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.data ? JSON.stringify(config.data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await this.parseResponse<T>(response);
      const headers = this.parseHeaders(response.headers);

      let httpResponse: HttpResponse<T> = {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers,
      };

      for (const interceptor of this.responseInterceptors) {
        httpResponse = await interceptor.onResponse(httpResponse);
      }

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          responseData
        );
      }

      return httpResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${config.timeout}ms`);
      }

      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCause = error instanceof Error ? error : undefined;
      throw new NetworkError(`Network error: ${errorMessage}`, errorCause);
    }
  }

  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    return `${url}?${searchParams.toString()}`;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return await response.json() as T;
    }
    
    if (contentType?.includes('text/')) {
      return await response.text() as unknown as T;
    }
    
    return await response.arrayBuffer() as unknown as T;
  }

  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  private validateRequest(config: HttpRequestConfig): void {
    if (!config.url) {
      throw new ValidationError('URL is required');
    }

    if (!config.method) {
      throw new ValidationError('HTTP method is required');
    }

    if (config.timeout && config.timeout < 0) {
      throw new ValidationError('Timeout must be positive');
    }
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }

    if (error instanceof NetworkError) {
      return true;
    }

    if (error instanceof HttpError) {
      return error.status >= 500 || error.status === 429;
    }

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  public addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  public setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  public setDefaultHeaders(headers: Record<string, string>): void {
    this.headers = { ...this.headers, ...headers };
  }
}