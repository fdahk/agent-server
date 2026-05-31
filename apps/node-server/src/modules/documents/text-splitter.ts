/**
 * 递归字符切分:按分隔符层级(段落→行→空格→字符)尽量在自然边界处断开,
 * 把长文切成不超过 chunkSize 的块,相邻块保留 chunkOverlap 重叠,
 * 让跨块的句子在检索时仍能命中上下文。行为对齐 LangChain RecursiveCharacterTextSplitter。
 */
export interface SplitOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', ' ', ''];

export function splitText(text: string, opts: SplitOptions): string[] {
  const separators = opts.separators ?? DEFAULT_SEPARATORS;
  return splitRecursive(text, separators, opts).filter((c) => c.trim() !== '');
}

/** 粗估 token 数:英文约 4 字符/token,中文偏 1,折中用 /3,仅用于元数据展示 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

function splitRecursive(
  text: string,
  separators: string[],
  opts: SplitOptions,
): string[] {
  const finalChunks: string[] = [];

  // 选定本层分隔符:第一个在文中出现的;都不在则退到末位(通常是 '')
  let separator = separators[separators.length - 1];
  let remaining: string[] = [];
  for (let i = 0; i < separators.length; i++) {
    const s = separators[i];
    if (s === '') {
      separator = s;
      break;
    }
    if (text.includes(s)) {
      separator = s;
      remaining = separators.slice(i + 1);
      break;
    }
  }

  const splits = separator === '' ? Array.from(text) : text.split(separator);

  const goodSplits: string[] = [];
  for (const part of splits) {
    if (part.length < opts.chunkSize) {
      goodSplits.push(part);
      continue;
    }
    // 单段已超长:先把攒着的合并出块,再对这段用更细的分隔符递归
    if (goodSplits.length) {
      finalChunks.push(...mergeSplits(goodSplits, separator, opts));
      goodSplits.length = 0;
    }
    if (remaining.length === 0) {
      finalChunks.push(part);
    } else {
      finalChunks.push(...splitRecursive(part, remaining, opts));
    }
  }
  if (goodSplits.length) {
    finalChunks.push(...mergeSplits(goodSplits, separator, opts));
  }
  return finalChunks;
}

/** 把若干小片用分隔符拼回不超过 chunkSize 的块,跨块滑窗保留 overlap */
function mergeSplits(
  splits: string[],
  separator: string,
  opts: SplitOptions,
): string[] {
  const sepLen = separator.length;
  const docs: string[] = [];
  const window: string[] = [];
  let total = 0;

  const join = (): string => window.join(separator).trim();

  for (const part of splits) {
    const addLen = part.length + (window.length > 0 ? sepLen : 0);
    if (total + addLen > opts.chunkSize && window.length > 0) {
      const doc = join();
      if (doc) docs.push(doc);
      // 退栈:腾到能放下新片且重叠不超过 chunkOverlap
      while (
        window.length > 0 &&
        (total > opts.chunkOverlap || total + addLen > opts.chunkSize)
      ) {
        total -= window[0].length + (window.length > 1 ? sepLen : 0);
        window.shift();
      }
    }
    window.push(part);
    total += part.length + (window.length > 1 ? sepLen : 0);
  }
  const doc = join();
  if (doc) docs.push(doc);
  return docs;
}
