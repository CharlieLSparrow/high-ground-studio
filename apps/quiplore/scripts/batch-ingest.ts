import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.DATA_CONNECT_EMULATOR_HOST = '127.0.0.1:9399';
const mockCredential = {
  getAccessToken: async () => ({
    access_token: 'owner',
    expires_in: 36000,
  }),
};
const app = initializeApp({
  projectId: 'demo-quiplore',
  credential: mockCredential
});
const dc = getDataConnect({ location: "us-central1", serviceId: "quiplore", connector: "default" });

const QUEUE_DIR = path.join(__dirname, 'ingest-queue');
const PROCESSED_DIR = path.join(__dirname, 'ingest-processed');
const FAILED_DIR = path.join(__dirname, 'ingest-failed');

if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
if (!fs.existsSync(FAILED_DIR)) fs.mkdirSync(FAILED_DIR, { recursive: true });

async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] }
        })
      });
      const data = await response.json();
      if (data.embedding && data.embedding.values) {
        return data.embedding.values;
      }
    } catch (err) {
      console.warn("Failed to generate real embedding, falling back to mock:", err);
    }
  }

  // Fallback mock
  return Array.from({ length: 768 }, () => (Math.random() - 0.5) * 0.1);
}

async function processFile(filePath: string, fileName: string) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(fileContent);
  } catch(e) {
    console.error(`Invalid JSON in ${fileName}. Moving to failed.`);
    fs.renameSync(filePath, path.join(FAILED_DIR, fileName));
    return;
  }

  const text = data.text || data.quote || data.body;
  const personId = data.personId || data.author || data.speaker || data.character || "system";
  const sourceWorkId = data.sourceWorkId || data.source || data.theme || "system";

  if (!text) {
    console.error(`Missing text/quote in ${fileName}. Moving to failed.`);
    fs.renameSync(filePath, path.join(FAILED_DIR, fileName));
    return;
  }

  let slug = data.slug;
  if (!slug) {
    const slugBase = `${personId}-${text.substring(0, 30)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    // Append unique hash to prevent constant collision if same author/start
    const hash = Math.random().toString(36).substring(2, 8);
    slug = `${slugBase}-${hash}`;
  }

  console.log(`Ingesting: ${slug}`);

  try {
    const textEmbedding = await generateEmbedding(text);

    const quoteVariables = {
      slug: slug,
      text: text,
      personId: personId,
      sourceWorkId: sourceWorkId,
      verificationStatus: data.verificationStatus || "verified",
      confidence: data.confidence || 0.9,
      contextNote: data.contextNote || data.theme || "Ingested autonomously",
      textEmbedding: textEmbedding
    };

    const quoteRes = await dc.executeMutation("InsertQuoteWithRawVector", quoteVariables);
    const quoteInsertRes = quoteRes.data?.quote_insert;
    const quoteId = typeof quoteInsertRes === 'string' ? quoteInsertRes : quoteInsertRes?.id;

    if (!quoteId) {
      throw new Error("Failed to insert quote, no ID returned.");
    }

    if (data.storyTrail) {
      const trailVariables = {
        quoteId: quoteId,
        slug: data.storyTrail.slug || (slug + "-story"),
        title: data.storyTrail.title,
        deck: data.storyTrail.deck || ""
      };

      const trailRes = await dc.executeMutation("InsertStoryTrail", trailVariables);
      const trailInsertRes = trailRes.data?.storyTrail_insert;
      const trailId = typeof trailInsertRes === 'string' ? trailInsertRes : trailInsertRes?.id;

      if (trailId && data.storyTrail.beats && data.storyTrail.beats.length > 0) {
        for (let i = 0; i < data.storyTrail.beats.length; i++) {
          const beat = data.storyTrail.beats[i];
          await dc.executeMutation("InsertStoryBeat", {
            storyTrailId: trailId,
            orderIndex: i,
            title: beat.title || `Beat ${i+1}`,
            body: beat.body || ""
          });
        }
      }
    }

    fs.renameSync(filePath, path.join(PROCESSED_DIR, fileName));
    console.log(`✅ Successfully processed and moved ${fileName}`);

  } catch(e: any) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("unique constraint") || errorMsg.includes("already exists") || errorMsg.includes("duplicate")) {
      console.log(`Quote ${data.slug} already exists. Moving to processed.`);
      fs.renameSync(filePath, path.join(PROCESSED_DIR, fileName));
    } else {
      console.error(`Error inserting ${fileName}: ${errorMsg}. Moving to failed.`);
      fs.renameSync(filePath, path.join(FAILED_DIR, fileName));
    }
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Starting The Great Ingestion Pipeline with Firebase Admin...");
  let totalProcessed = 0;

  while (true) {
    const files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log(`🎉 All done! Processed ${totalProcessed} quotes.`);
      break;
    }

    const batch = files.slice(0, 10);
    console.log(`Processing batch of ${batch.length} files... (${files.length} remaining in queue)`);

    const promises = batch.map(async (fileName) => {
      const filePath = path.join(QUEUE_DIR, fileName);
      try {
        await processFile(filePath, fileName);
        totalProcessed++;
      } catch (err: any) {
        console.error(`❌ Failed to process ${fileName}:`, err.message);
      }
    });

    await Promise.allSettled(promises);
    await sleep(500);
  }
}

main().catch(console.error);
