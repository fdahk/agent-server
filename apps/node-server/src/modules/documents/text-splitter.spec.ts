import { describe, it, expect } from 'vitest';
import { splitText, estimateTokens } from './text-splitter';

describe('splitText', () => {
  it('短文不足一块时原样返回单块', () => {
    const out = splitText('hello world', { chunkSize: 100, chunkOverlap: 10 });
    expect(out).toEqual(['hello world']);
  });

  it('优先在段落边界(\\n\\n)断开', () => {
    const text = 'AAAA\n\nBBBB';
    const out = splitText(text, { chunkSize: 5, chunkOverlap: 0 });
    expect(out).toEqual(['AAAA', 'BBBB']);
  });

  it('每块长度都不超过 chunkSize', () => {
    const text = Array.from({ length: 60 }, () => 'word').join(' ');
    const out = splitText(text, { chunkSize: 50, chunkOverlap: 10 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(50);
  });

  it('相邻块之间保留 overlap(有内容重叠)', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const out = splitText(words.join(' '), { chunkSize: 30, chunkOverlap: 12 });
    expect(out.length).toBeGreaterThan(1);
    const firstTokens = new Set(out[0].split(' '));
    const secondTokens = out[1].split(' ');
    expect(secondTokens.some((t) => firstTokens.has(t))).toBe(true);
  });

  it('过滤掉纯空白块', () => {
    const out = splitText('A\n\n\n\nB', { chunkSize: 1, chunkOverlap: 0 });
    expect(out).toEqual(['A', 'B']);
  });
});

describe('estimateTokens', () => {
  it('至少为 1,按 ~字符/3 估算', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcdef')).toBe(2);
  });
});
