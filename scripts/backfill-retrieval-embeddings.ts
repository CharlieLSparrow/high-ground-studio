import { getPrismaClient } from "../apps/quipsly/src/lib/prisma";
import { GoogleGenAI } from "@google/genai";

async function main() {
  const prisma = getPrismaClient();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not set. Cannot backfill embeddings.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log("🔍 Scanning for RetrievalEmbedding rows without vectors...");

  // Since `embedding` is an Unsupported type in Prisma, we use raw SQL to find nulls.
  const rowsToBackfill = await prisma.$queryRaw<Array<{ id: string; contentSnapshot: string }>>`
    SELECT id, "contentSnapshot"
    FROM "RetrievalEmbedding"
    WHERE embedding IS NULL;
  `;

  if (rowsToBackfill.length === 0) {
    console.log("✅ No rows need backfilling. Everything is up to date!");
    return;
  }

  console.log(`🚀 Found ${rowsToBackfill.length} rows to backfill. Starting batch process...`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of rowsToBackfill) {
    try {
      // 1. Generate the embedding from Gemini
      const response = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: row.contentSnapshot,
      });

      const vector = response.embeddings?.[0]?.values;

      if (!vector || vector.length === 0) {
        throw new Error("Empty vector returned from Gemini API.");
      }

      // 2. Format as a Postgres vector string: '[0.1, 0.2, ...]'
      const vectorString = `[${vector.join(",")}]`;

      // 3. Update the row using raw SQL
      await prisma.$executeRaw`
        UPDATE "RetrievalEmbedding"
        SET embedding = ${vectorString}::vector
        WHERE id = ${row.id};
      `;

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`⏳ Processed ${successCount}/${rowsToBackfill.length}...`);
      }
    } catch (error) {
      console.error(`❌ Failed to embed row ${row.id}:`, error);
      errorCount++;
    }
  }

  console.log("🎉 Backfill complete!");
  console.log(`✅ Success: ${successCount}`);
  if (errorCount > 0) console.log(`⚠️ Errors: ${errorCount}`);
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
