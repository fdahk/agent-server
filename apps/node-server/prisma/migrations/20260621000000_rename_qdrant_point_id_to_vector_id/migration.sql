-- 向量库由 Qdrant 切换为 Milvus:列重命名,语义不变(仍存摄取生成的向量主键 UUID)。
ALTER TABLE "document_chunks" RENAME COLUMN "qdrant_point_id" TO "vector_id";
