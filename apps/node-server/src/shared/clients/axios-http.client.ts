/**
 * 主要用途：
 *   - OllamaProvider 调用本地 Ollama 模型 API
 *   - ResourceCollectionService 抓取网页内容
 *
 *   1. 统一超时、请求头、错误处理等配置
 *   2. 自动为每个请求添加唯一的 X-Request-Id，方便链路追踪
 *   3. 对外暴露简洁的 get/post 方法，屏蔽 Axios 的复杂细节
 *   4. 作为 @Injectable() 的 provider，可以在任何服务中通过依赖注入使用
 */

import { Injectable } from '@nestjs/common';

/** randomUUID 来自 Node.js 内置的 crypto 模块，用于生成 UUID v4 格式的唯一标识 */
import { randomUUID } from 'node:crypto';

import axios, {
  AxiosError,
  AxiosHeaders,
  /** AxiosInstance 是 Axios 实例的类型，类似于通过 axios.create() 创建出来的对象 */
  type AxiosInstance,
  /** AxiosRequestConfig 是请求配置的类型，包含 url、method、headers、timeout 等字段 */
  type AxiosRequestConfig,
  /** 响应头的类型定义 */
  type AxiosResponseHeaders,
  type RawAxiosResponseHeaders,
} from 'axios';

/**
 * HttpClientRequestConfig —— 调用方传入的请求配置类型
 *
 * 【TypeScript 语法：type 关键字】
 * type 用于定义"类型别名"，给一个类型起一个易读的名字。
 * type 和 interface 都可以定义对象类型，主要区别：
 *   - type 更灵活，支持联合类型、交叉类型、映射类型等
 *   - interface 支持声明合并（同名 interface 会自动合并字段）
 *
 * Omit<AxiosRequestConfig, 'url' | 'method'> 是 TypeScript 内置工具类型：
 * 它从 AxiosRequestConfig 中剔除 url 和 method 字段。
 * 因为 url 和 method 由 get/post 方法内部指定，不需要调用方传入。
 */
export type HttpClientRequestConfig = Omit<
  AxiosRequestConfig,
  'url' | 'method'
>;

/**
 * HttpClientResponse —— 统一的 HTTP 响应类型
 *
 * 将 Axios 原始响应简化为几个关键字段，对外提供一致的响应结构。
 */
export type HttpClientResponse<T> = {
  data: T;
  status: number;
  statusText: string;
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders;
  url: string;
  ok: boolean;
};

/**
 * AxiosHttpClient —— 可注入的 HTTP 客户端服务
 *
 * @Injectable() 使得这个类可以被 NestJS 依赖注入容器管理，
 * 在需要发 HTTP 请求的服务中，只需在构造函数参数中声明即可自动注入。
 */
@Injectable()
export class AxiosHttpClient {
  /**
   * Axios 实例，所有请求都通过它发出。
   * private readonly 表示：仅本类内部可用，且创建后不可更改引用。
   */
  private readonly instance: AxiosInstance;

  /**
   * 构造函数：创建并配置 Axios 实例
   *
   * NestJS 在实例化 AxiosHttpClient 时自动调用此构造函数。
   * 由于本类不依赖其他 provider，构造函数没有参数。
   */
  constructor() {
    /**
     * axios.create() 创建一个独立的 Axios 实例（而非使用全局默认实例）。
     * 这样不同用途的 HTTP 客户端可以有各自独立的配置，互不干扰。
     */
    this.instance = axios.create({
      /** 默认超时时间，从环境变量读取，未设置则为 30 秒 */
      timeout: Number(process.env.HTTP_CLIENT_TIMEOUT_MS ?? 30000),
      /**
       * validateStatus: () => true 表示"不管 HTTP 状态码是什么，都不抛异常"。
       * 默认 Axios 在 4xx/5xx 时会抛出 AxiosError，这里选择自己处理状态码，
       * 通过 response.ok 字段让调用方判断请求是否成功。
       */
      validateStatus: () => true,
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    /**
     * 请求拦截器（Interceptor）：在每个请求发出前自动执行的回调。
     * 这里的拦截器做了一件事：如果请求头中没有 X-Request-Id，就自动生成一个 UUID。
     * 这个唯一 ID 用于在日志中追踪"一次请求从发出到响应"的完整链路。
     */
    this.instance.interceptors.request.use((config) => {
      const headers = AxiosHeaders.from(config.headers);

      if (!headers.has('X-Request-Id')) {
        headers.set('X-Request-Id', randomUUID());
      }

      config.headers = headers;
      return config;
    });
  }

  /**
   * 发送 HTTP GET 请求
   *
   * @param url    - 请求的完整 URL
   * @param config - 可选的额外配置（如 headers、timeout）
   * @returns Promise<HttpClientResponse<T>> - 异步返回统一格式的响应
   */
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

  /**
   * 发送 HTTP POST 请求
   *
   * @param url    - 请求的完整 URL
   * @param data   - 请求体数据，类型为 unknown（最安全的"任意类型"）
   * @param config - 可选的额外配置
   * @returns Promise<HttpClientResponse<T>>
   */
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

  /**
   * 核心请求方法：所有 get/post 最终都调用此方法
   *
   * async 标记使方法返回 Promise，内部可以使用 await。
   * 将 Axios 原始响应转换为 HttpClientResponse 统一格式。
   */
  async request<T>(config: AxiosRequestConfig): Promise<HttpClientResponse<T>> {
    try {
      const response = await this.instance.request<T>(config);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        url: response.config.url ?? '',
        /** 判断状态码是否在 200-299 范围内 */
        ok: response.status >= 200 && response.status < 300,
      };
    } catch (error) {
      /** 将各种 Axios 错误统一转换为标准 Error 后抛出 */
      throw this.normalizeError(error);
    }
  }

  /**
   * 错误标准化：将 Axios 特有的错误类型转换为通用 Error
   *
   * private 表示此方法仅本类内部可调用，不对外暴露。
   *
   * @param error - 原始错误对象，类型为 unknown（因为 catch 中的 error 没有确定类型）
   * @returns Error - 统一格式的错误对象，包含中文错误描述
   */
  private normalizeError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      /** 请求被主动取消（如 AbortController） */
      if (error.code === AxiosError.ERR_CANCELED) {
        return new Error('HTTP 请求已取消');
      }

      /** 请求超时 */
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
