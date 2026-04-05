/**
 * 资源采集服务 —— 从本地目录和网页 URL 收集文本资源
 *
 * 本服务是 Agent 编排流程的"数据采集层"，负责在 AI 处理之前准备好原始材料。
 * 它提供两种采集方式：
 *   1. collectFromDirectories()：递归扫描本地目录，读取支持的文本文件
 *   2. collectFromUrls()：抓取网页，提取标题和正文文本
 *
 * 为了防止资源过多导致 AI 处理超时或 OOM，内置了多项安全限制：
 *   - 最大文件数量（AGENT_MAX_FILES）
 *   - 单文件最大尺寸（AGENT_MAX_FILE_SIZE）
 *   - 所有文件总尺寸上限（AGENT_MAX_TOTAL_BYTES）
 *   - 单资源最大字符数（AGENT_MAX_RESOURCE_CHARS）
 */

import { Injectable } from '@nestjs/common';
/** randomUUID：生成 UUID v4 格式的唯一标识符 */
import { randomUUID } from 'node:crypto';
/** Node.js 文件系统操作（Promise 版本，支持 async/await） */
import { readFile, readdir, stat } from 'node:fs/promises';
/**
 * Dirent：目录条目类型，包含文件名和文件类型（文件/目录/符号链接等）
 * Stats：文件状态信息类型，包含文件大小、修改时间等
 */
import type { Dirent, Stats } from 'node:fs';
import * as path from 'node:path';
/**
 * cheerio 是一个服务端的 jQuery 替代品，用于解析 HTML 文档。
 * load() 函数接收 HTML 字符串，返回一个类似 jQuery 的 $ 对象，
 * 可以使用 CSS 选择器查询和操作 DOM。
 */
import { load } from 'cheerio';
import { AxiosHttpClient } from '../../../shared/clients/axios-http.client';
import type { CollectedResource } from '../types/types';

/**
 * ResourceCollectionService —— 资源采集服务
 *
 * @Injectable() 标记后，NestJS 会将其注册为可注入的 provider。
 * 它被 AgentService 通过构造函数注入并调用。
 */
@Injectable()
export class ResourceCollectionService {
  /** 注入 HTTP 客户端，用于抓取网页 */
  constructor(private readonly httpClient: AxiosHttpClient) {}

  /**
   * 支持采集的文本文件扩展名白名单。
   * 使用 Set 数据结构而非数组，因为 Set.has() 查询是 O(1)，而 Array.includes() 是 O(n)。
   * 这里涵盖了常见的文档、代码和样式文件。
   */
  private readonly supportedTextExtensions = new Set([
    '.md',
    '.txt',
    '.json',
    '.html',
    '.htm',
    '.csv',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.go',
    '.scss',
    '.css',
  ]);

  /** 最大文件数量限制，防止扫描到过多文件 */
  private readonly maxFiles = Number(process.env.AGENT_MAX_FILES ?? 12);

  /** 单个文件的最大字节数限制（默认 256KB） */
  private readonly maxFileSizeBytes = Number(
    process.env.AGENT_MAX_FILE_SIZE ?? 262144,
  );

  /** 所有文件累计总字节数上限（默认 2MB） */
  private readonly maxTotalBytes = Number(
    process.env.AGENT_MAX_TOTAL_BYTES ?? 2097152,
  );

  /** 单个资源内容的最大字符数（默认 12000 字符），超出部分会被截断 */
  private readonly maxCharsPerResource = Number(
    process.env.AGENT_MAX_RESOURCE_CHARS ?? 12000,
  );

  /** 抓取网页时的 HTTP 超时时间（毫秒） */
  private readonly httpTimeoutMs = Number(
    process.env.AGENT_HTTP_TIMEOUT_MS ?? 30000,
  );

  /**
   * 从多个目录中采集资源
   *
   * 按顺序遍历每个目录，递归扫描其中的文件。
   * 当达到文件数量或总字节数上限时提前终止。
   *
   * @param directories - 用户指定的目录路径数组
   * @returns Promise<CollectedResource[]> - 采集到的资源列表
   */
  async collectFromDirectories(
    directories: string[],
  ): Promise<CollectedResource[]> {
    const resources: CollectedResource[] = [];
    /** 累计已消耗的字节数，用于全局限流 */
    let consumedBytes = 0;

    for (const inputDir of directories) {
      /** path.resolve 将相对路径转为绝对路径，确保路径一致性 */
      const resolvedDir = path.resolve(inputDir);
      await this.walkDirectory(resolvedDir, resources, {
        consumedBytes,
        seenFiles: new Set<string>(),
      });

      /**
       * .reduce() 是数组的归约方法：遍历数组，将每个元素累加到一个最终值中。
       * 这里将所有资源的 size 字段求和，得到当前已消耗的总字节数。
       */
      consumedBytes = resources.reduce(
        (total, item) => total + Number(item.metadata.size ?? 0),
        0,
      );

      /** 达到上限则提前结束，不再扫描后续目录 */
      if (
        resources.length >= this.maxFiles ||
        consumedBytes >= this.maxTotalBytes
      ) {
        break;
      }
    }

    return resources;
  }

  /**
   * 从多个 URL 中采集网页资源
   *
   * 按顺序抓取每个 URL，提取标题和正文。
   * 单个 URL 抓取失败时静默跳过，不影响其他 URL。
   *
   * @param urls - 用户指定的 URL 列表
   * @returns Promise<CollectedResource[]> - 采集到的网页资源列表
   */
  async collectFromUrls(urls: string[]): Promise<CollectedResource[]> {
    const resources: CollectedResource[] = [];

    for (const rawUrl of urls) {
      const resource = await this.fetchUrl(rawUrl);
      if (resource) {
        resources.push(resource);
      }
    }

    return resources;
  }

  /**
   * 递归遍历目录，采集符合条件的文件（私有方法）
   *
   * @param directory - 当前遍历的目录绝对路径
   * @param resources - 资源收集数组（引用传递，直接往里 push）
   * @param context   - 遍历上下文，包含已消耗字节数和已处理文件集合
   *
   * 【递归遍历】
   * 遇到子目录时，函数调用自身继续深入遍历，直到所有层级都被扫描。
   * 这是一种经典的"深度优先搜索（DFS）"策略。
   */
  private async walkDirectory(
    directory: string,
    resources: CollectedResource[],
    context: {
      consumedBytes: number;
      /** Set<string> 用于记录已处理的文件路径，避免重复采集 */
      seenFiles: Set<string>;
    },
  ): Promise<void> {
    /**
     * Dirent[] 是目录条目数组类型。
     * readdir 配合 { withFileTypes: true } 返回 Dirent 对象而非纯文件名，
     * 这样可以直接判断是文件还是目录，无需额外调用 stat。
     */
    let entries: Dirent[];

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      /** 目录不存在或无权访问时静默返回 */
      return;
    }

    for (const entry of entries) {
      /** 检查是否已达上限 */
      if (
        resources.length >= this.maxFiles ||
        context.consumedBytes >= this.maxTotalBytes
      ) {
        return;
      }

      /** path.join 将目录路径和文件名拼接为完整路径 */
      const fullPath = path.join(directory, entry.name);

      /** 如果是目录，递归深入 */
      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, resources, context);
        continue;
      }

      /** 如果不是普通文件（如符号链接等），跳过 */
      if (!entry.isFile()) {
        continue;
      }

      /** 获取文件扩展名并转小写，用于白名单匹配 */
      const extension = path.extname(entry.name).toLowerCase();

      /** 扩展名不在白名单中，或文件已处理过，跳过 */
      if (
        !this.supportedTextExtensions.has(extension) ||
        context.seenFiles.has(fullPath)
      ) {
        continue;
      }

      /** Stats 包含文件的元信息（大小、修改时间等） */
      let fileStat: Stats;

      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      /** 跳过空文件、超大文件、或会导致总量超限的文件 */
      if (
        fileStat.size === 0 ||
        fileStat.size > this.maxFileSizeBytes ||
        context.consumedBytes + fileStat.size > this.maxTotalBytes
      ) {
        continue;
      }

      /** 读取文件文本内容（可能返回 null 表示读取失败） */
      const content = await this.readTextFile(fullPath);
      if (!content) {
        continue;
      }

      /** 将文件路径加入已处理集合，防止重复 */
      context.seenFiles.add(fullPath);
      context.consumedBytes += fileStat.size;

      /** 构造 CollectedResource 对象并加入结果集 */
      resources.push({
        id: randomUUID(),
        kind: 'local_file',
        title: path.basename(fullPath),
        source: fullPath,
        content,
        snippet: this.createSnippet(content),
        metadata: {
          path: fullPath,
          extension,
          size: fileStat.size,
        },
      });
    }
  }

  /**
   * 读取文本文件内容（私有方法）
   *
   * @param fullPath - 文件的绝对路径
   * @returns Promise<string | null> - 文件内容字符串，或 null 表示读取失败/内容为空
   *
   * 【string | null 联合类型】
   * 调用方需要用 if 检查非空后才能安全使用。
   */
  private async readTextFile(fullPath: string): Promise<string | null> {
    try {
      /** 以 UTF-8 编码读取文件内容 */
      const raw = await readFile(fullPath, 'utf-8');
      /** 移除所有 NULL 字符（\0）并去除首尾空白，防止二进制文件混入 */
      const normalized = raw.replaceAll('\0', '').trim();

      if (!normalized) {
        return null;
      }

      /** 截断到最大字符数限制 */
      return normalized.slice(0, this.maxCharsPerResource);
    } catch {
      return null;
    }
  }

  /**
   * 抓取单个网页并提取正文（私有方法）
   *
   * @param rawUrl - 用户提供的原始 URL 字符串
   * @returns Promise<CollectedResource | null> - 网页资源对象，或 null 表示抓取失败
   */
  private async fetchUrl(rawUrl: string): Promise<CollectedResource | null> {
    /** URL 构造函数会校验 URL 格式，格式不合法时抛异常 */
    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }

    try {
      /** 以纯文本模式请求网页 HTML */
      const response = await this.httpClient.get<string>(parsed.toString(), {
        responseType: 'text',
        timeout: this.httpTimeoutMs,
        headers: {
          'User-Agent': 'AiAgent Resource Collector/1.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      /**
       * 使用 cheerio 解析 HTML：
       *   load() 将 HTML 字符串解析为可操作的 DOM 树
       *   $() 函数类似 jQuery，支持 CSS 选择器查询
       */
      const $ = load(response.data);
      /** 移除 script、style、noscript 标签，避免干扰正文提取 */
      $('script, style, noscript').remove();

      /** 提取页面标题，失败则使用域名作为标题 */
      const title = $('title').first().text().trim() || parsed.hostname;
      /** 提取 meta description 描述（如果有的话） */
      const description =
        $('meta[name="description"]').attr('content')?.trim() ?? null;
      /** 提取 body 内所有文本，将连续空白压缩为单个空格 */
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      /** 截断到最大字符数限制 */
      const normalized = text.slice(0, this.maxCharsPerResource);

      if (!normalized) {
        return null;
      }

      return {
        id: randomUUID(),
        kind: 'web_page',
        title,
        source: parsed.toString(),
        content: normalized,
        snippet: this.createSnippet(normalized),
        metadata: {
          url: parsed.toString(),
          hostname: parsed.hostname,
          description,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * 生成内容片段/摘要预览（私有方法）
   *
   * 将内容压缩空白后截取前 180 个字符，用于在事件推送等场景快速展示。
   *
   * @param content - 完整的资源内容
   * @returns string - 180 字符以内的片段
   */
  private createSnippet(content: string): string {
    return content.replace(/\s+/g, ' ').slice(0, 180).trim();
  }
}
