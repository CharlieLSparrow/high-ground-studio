-- Create extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "RetrievalEmbedding" ADD COLUMN "embedding" vector(768);
