import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

/** 允许的上传类型:扩展名 → 是否受支持。校验与解析都以此为准 */
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'docx', 'md', 'markdown', 'txt']);

/** 单文件大小上限,既用于 multer limits 也用于业务层兜底校验 */
export const MAX_UPLOAD_BYTES = Number(
  process.env.DOCUMENT_MAX_BYTES ?? 10 * 1024 * 1024,
);

export const SUPPORTED_HINT = '仅支持 pdf / docx / md / txt';

export function extname(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function isSupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filename));
}

/** 把上传文件的字节解析成纯文本。pdf/docx 走对应解析器,其余按 UTF-8 文本读 */
export async function parseToText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  switch (extname(filename)) {
    case 'pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const { text } = await parser.getText();
        return text;
      } finally {
        await parser.destroy();
      }
    }
    case 'docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    default:
      return buffer.toString('utf-8');
  }
}
