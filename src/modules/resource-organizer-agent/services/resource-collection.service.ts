import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import * as path from 'node:path';
import { load } from 'cheerio';
import { AxiosHttpClient } from '../../../shared/clients/axios-http.client';
import type { CollectedResource } from '../types/types';

@Injectable()
export class ResourceCollectionService {
  constructor(private readonly httpClient: AxiosHttpClient) {}

  // 仅采集白名单里的文本类资源，避免把二进制文件或超大文件直接喂给后续模型
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

  private readonly maxFiles = Number(process.env.AGENT_MAX_FILES ?? 12);
  private readonly maxFileSizeBytes = Number(
    process.env.AGENT_MAX_FILE_SIZE ?? 262144,
  );
  private readonly maxTotalBytes = Number(
    process.env.AGENT_MAX_TOTAL_BYTES ?? 2097152,
  );
  private readonly maxCharsPerResource = Number(
    process.env.AGENT_MAX_RESOURCE_CHARS ?? 12000,
  );
  private readonly httpTimeoutMs = Number(
    process.env.AGENT_HTTP_TIMEOUT_MS ?? 30000,
  );

  async collectFromDirectories(
    directories: string[],
  ): Promise<CollectedResource[]> {
    const resources: CollectedResource[] = [];
    let consumedBytes = 0;

    for (const inputDir of directories) {
      // 先把用户输入路径解析成绝对路径，再递归遍历
      const resolvedDir = path.resolve(inputDir);
      // 递归遍历目录下的文件和子目录，参数：已消耗字节数、已访问文件集合
      await this.walkDirectory(resolvedDir, resources, {
        consumedBytes,
        seenFiles: new Set<string>(),
      });

      // 计算已消耗字节数
      consumedBytes = resources.reduce(
        (total, item) => total + Number(item.metadata.size ?? 0),
        0,
      );
      // 如果已消耗字节数超过最大字节数，则结束
      if (
        resources.length >= this.maxFiles ||
        consumedBytes >= this.maxTotalBytes
      ) {
        break;
      }
    }

    return resources;
  }

  async collectFromUrls(urls: string[]): Promise<CollectedResource[]> {
    const resources: CollectedResource[] = [];

    for (const rawUrl of urls) {
      // URL 逐个抓取；单条失败时返回 null，不阻塞其它 URL
      const resource = await this.fetchUrl(rawUrl);

      if (resource) {
        resources.push(resource);
      }
    }

    return resources;
  }

  private async walkDirectory(
    directory: string,
    resources: CollectedResource[],
    context: {
      consumedBytes: number;
      seenFiles: Set<string>;
    },
  ): Promise<void> {
    let entries: Dirent[]; // 目录项

    try {
      // withFileTypes: true 可直接拿到 Dirent，避免每个条目都额外 stat 一次才知道类型
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        resources.length >= this.maxFiles ||
        context.consumedBytes >= this.maxTotalBytes
      ) {
        return;
      }

      const fullPath = path.join(directory, entry.name);

      // isDirectory() 是 Dirent 对象的方法，用于判断是否为目录
      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, resources, context);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase(); // 获取文件扩展名

      if (
        !this.supportedTextExtensions.has(extension) ||
        context.seenFiles.has(fullPath)
      ) {
        continue;
      }

      let fileStat: Stats;

      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      if (
        fileStat.size === 0 ||
        fileStat.size > this.maxFileSizeBytes ||
        context.consumedBytes + fileStat.size > this.maxTotalBytes
      ) {
        continue;
      }

      const content = await this.readTextFile(fullPath);

      if (!content) {
        continue;
      }

      context.seenFiles.add(fullPath);
      context.consumedBytes += fileStat.size;

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

  private async readTextFile(fullPath: string): Promise<string | null> {
    try {
      const raw = await readFile(fullPath, 'utf-8');
      // 去掉 \0 并裁掉首尾空白，避免把空内容或脏字符继续传给模型
      const normalized = raw.replaceAll('\0', '').trim();

      if (!normalized) {
        return null;
      }

      return normalized.slice(0, this.maxCharsPerResource);
    } catch {
      return null;
    }
  }

  private async fetchUrl(rawUrl: string): Promise<CollectedResource | null> {
    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }

    try {
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

      const html = response.data;
      // cheerio 负责把 HTML 解析成可用选择器查询的 DOM 结构
      const $ = load(html);
      // 去掉脚本和样式，只保留更接近正文的可见文本
      $('script, style, noscript').remove();

      const title = $('title').first().text().trim() || parsed.hostname;
      const description =
        $('meta[name="description"]').attr('content')?.trim() ?? null;
      const text = $('body').text().replace(/\s+/g, ' ').trim();
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

  private createSnippet(content: string): string {
    // 生成统一长度的摘要片段，便于前端列表快速预览
    return content.replace(/\s+/g, ' ').slice(0, 180).trim();
  }
}
