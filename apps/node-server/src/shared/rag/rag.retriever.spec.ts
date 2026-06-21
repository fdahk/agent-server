import { describe, it, expect, vi, type Mock } from 'vitest';
import { RagRetriever } from './rag.retriever';
import type { LlmService } from '../llm/llm.service';
import type { MilvusService } from '../milvus/milvus.service';
import type { PrismaService } from '../prisma/prisma.service';

type Mocks = {
  embed: Mock;
  searchByUser: Mock;
  findMany: Mock;
  retriever: RagRetriever;
};

function makeMocks(): Mocks {
  const embed = vi.fn();
  const searchByUser = vi.fn();
  const findMany = vi.fn();
  const llm = { embed } as unknown as LlmService;
  const milvus = { searchByUser } as unknown as MilvusService;
  const prisma = {
    documentChunk: { findMany },
  } as unknown as PrismaService;
  return {
    embed,
    searchByUser,
    findMany,
    retriever: new RagRetriever(llm, milvus, prisma),
  };
}

const hit = (chunkId: number, score: number) => ({
  payload: { user_id: 1, document_id: 9, chunk_id: chunkId, chunk_index: 0 },
  score,
});
const row = (id: number, content: string) => ({
  id,
  documentId: 9,
  chunkIndex: 0,
  content,
});

describe('RagRetriever', () => {
  it('强制经 searchByUser 检索:用 query 向量 + userId + topK', async () => {
    const m = makeMocks();
    m.embed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    m.searchByUser.mockResolvedValueOnce([hit(5, 0.9)]);
    m.findMany.mockResolvedValueOnce([row(5, 'hello')]);

    await m.retriever.retrieve(42, 'q', 3);

    expect(m.embed).toHaveBeenCalledWith('q');
    expect(m.searchByUser).toHaveBeenCalledWith([0.1, 0.2, 0.3], 42, 3);
  });

  it('无命中时直接返回空,不查 Postgres', async () => {
    const m = makeMocks();
    m.embed.mockResolvedValueOnce([[0.1]]);
    m.searchByUser.mockResolvedValueOnce([]);

    const out = await m.retriever.retrieve(1, 'q');
    expect(out).toEqual([]);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('保持 Milvus 命中顺序(相似度降序),与 Postgres 返回顺序无关', async () => {
    const m = makeMocks();
    m.embed.mockResolvedValueOnce([[0.1]]);
    m.searchByUser.mockResolvedValueOnce([hit(5, 0.9), hit(3, 0.7)]);
    // Postgres 故意乱序返回
    m.findMany.mockResolvedValueOnce([row(3, 'B'), row(5, 'A')]);

    const out = await m.retriever.retrieve(1, 'q');
    expect(out.map((c) => c.chunkId)).toEqual([5, 3]);
    expect(out.map((c) => c.score)).toEqual([0.9, 0.7]);
    expect(out[0].content).toBe('A');
  });

  it('Postgres 已删的 chunk 跳过,不抛错', async () => {
    const m = makeMocks();
    m.embed.mockResolvedValueOnce([[0.1]]);
    m.searchByUser.mockResolvedValueOnce([hit(5, 0.9), hit(99, 0.6)]);
    m.findMany.mockResolvedValueOnce([row(5, 'A')]); // 99 不存在

    const out = await m.retriever.retrieve(1, 'q');
    expect(out.map((c) => c.chunkId)).toEqual([5]);
  });
});
