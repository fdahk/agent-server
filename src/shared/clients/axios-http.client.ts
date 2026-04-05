import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponseHeaders,
  type RawAxiosResponseHeaders,
} from 'axios';

export type HttpClientRequestConfig = Omit<
  AxiosRequestConfig,
  'url' | 'method'
>;

export type HttpClientResponse<T> = {
  data: T;
  status: number;
  statusText: string;
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders;
  url: string;
  ok: boolean;
};

@Injectable()
export class AxiosHttpClient {
  private readonly instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      timeout: Number(process.env.HTTP_CLIENT_TIMEOUT_MS ?? 30000),
      validateStatus: () => true,
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    this.instance.interceptors.request.use((config) => {
      const headers = AxiosHeaders.from(config.headers);

      if (!headers.has('X-Request-Id')) {
        headers.set('X-Request-Id', randomUUID());
      }

      config.headers = headers;
      return config;
    });
  }

  get<T>(
    url: string,
    config?: HttpClientRequestConfig,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'GET',
    });
  }

  post<T>(
    url: string,
    data?: unknown,
    config?: HttpClientRequestConfig,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'POST',
      data,
    });
  }

  async request<T>(config: AxiosRequestConfig): Promise<HttpClientResponse<T>> {
    try {
      const response = await this.instance.request<T>(config);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        url: response.config.url ?? '',
        ok: response.status >= 200 && response.status < 300,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      if (error.code === AxiosError.ERR_CANCELED) {
        return new Error('HTTP 请求已取消');
      }

      if (error.code === AxiosError.ECONNABORTED) {
        return new Error('HTTP 请求超时');
      }

      if (error.message) {
        return new Error(`HTTP 请求失败：${error.message}`);
      }
    }

    return error instanceof Error ? error : new Error('HTTP 请求失败');
  }
}
