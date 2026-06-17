import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "node:crypto";

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Skipping real DB connection.");
    console.log("Mocking QuipLore Embedding Sync worker run.");
    console.log("Simulating scan: 14 QuipLore Quotes found.");
    console.log("Simulating embedding generation: 14 upserted into RetrievalEmbedding index.");
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
    log: ["error"],
  });

  try {
    console.log("Starting QuipLore Embedding Sync Worker...");

    // 1. Fetch all quotes with their relationships to build a rich semantic string
    const quotes = await prisma.quipLoreQuote.findMany({
      include: {
        author: true,
        work: true,
        tags: { include: { theme: true } },
      }
    });

    let embeddedCount = 0;
    let skippedCount = 0;

    for (const quote of quotes) {
      // 2. Build the semantic string to embed
      // By including the author, work, and tags, the vector space becomes much richer.
      const authorStr = quote.author ? `Author: ${quote.author.name}` : "";
      const workStr = quote.work ? `Work: ${quote.work.title}` : "";
      const tagsStr = quote.tags.length > 0 
        ? `Themes: ${quote.tags.map(t => t.name).join(", ")}` 
        : "";
      
      const contentSnapshot = `
${authorStr}
${workStr}
${tagsStr}
Quote:
"${quote.text}"
      `.trim();

      // 3. Hash the content snapshot to quickly check if it has changed
      const contentHash = hashContent(contentSnapshot);

      // 4. Check if the embedding already exists and is up to date
      const existingEmbedding = await prisma.retrievalEmbedding.findFirst({
        where: {
          sourceOrigin: "quipsly-lore",
          sourceId: quote.id,
        }
      });

      // If the content snapshot matches, skip. The vector is still accurate.
      if (existingEmbedding && existingEmbedding.contentSnapshot === contentHash) {
        skippedCount++;
        continue;
      }

      // 5. [MOCK] Call the LLM Embedding Endpoint (e.g. text-embedding-3-small)
      // For this example, we generate a mock vector of 768 dimensions (matching the schema's vector(768)).
      // const vectorResponse = await openai.embeddings.create({ input: contentSnapshot ... });
      const mockVector = Array(768).fill(0).map(() => Math.random() * 2 - 1);
      // We must stringify the vector array into the Postgres format: '[1.0, 2.0, ...]'
      const pgVectorString = `[${mockVector.join(",")}]`;

      // 6. Upsert the Metadata and Vector row tracking this embedding
      // Since Prisma uses `Unsupported("vector(768)")`, we CANNOT use `prisma.retrievalEmbedding.update()`.
      // We must drop down to `$executeRaw` to safely inject the vector string.
      if (existingEmbedding) {
        await prisma.$executeRaw`
          UPDATE "RetrievalEmbedding"
          SET "contentSnapshot" = ${contentHash},
              "embedding" = ${pgVectorString}::vector
          WHERE "id" = ${existingEmbedding.id}
        `;
      } else {
        // We use gen_random_uuid() for the Postgres native CUID equivalent (or we could pass a generated CUID from JS).
        const newCuid = crypto.randomBytes(12).toString('hex'); // simple mock cuid
        await prisma.$executeRaw`
          INSERT INTO "RetrievalEmbedding" ("id", "sourceOrigin", "sourceId", "projectId", "contentSnapshot", "embedding", "createdAt")
          VALUES (
            ${newCuid},
            'quipsly-lore',
            ${quote.id},
            ${quote.projectId},
            ${contentHash},
            ${pgVectorString}::vector,
            now()
          )
        `;
      }
      embeddedCount++;
    }

    console.log(`Sync complete.`);
    console.log(`- ${skippedCount} quotes were already up to date.`);
    console.log(`- ${embeddedCount} quotes were embedded and upserted.`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Embedding sync failed:", error);
  process.exit(1);
});
