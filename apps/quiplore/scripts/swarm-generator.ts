import { GoogleGenAI, Type, Schema } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const queueDir = path.join(__dirname, 'ingest-queue');

if (!fs.existsSync(queueDir)) {
  fs.mkdirSync(queueDir, { recursive: true });
}

const agentsMdPath = path.join(__dirname, '..', '..', '..', '.agents', 'AGENTS.md');
const brandVoice = fs.existsSync(agentsMdPath) ? fs.readFileSync(agentsMdPath, 'utf8') : "Be witty, clever, and tell facts as stories.";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      slug: { type: Type.STRING },
      text: { type: Type.STRING },
      personId: { type: Type.STRING },
      sourceWorkId: { type: Type.STRING },
      verificationStatus: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
      contextNote: { type: Type.STRING },
      storyTrail: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          deck: { type: Type.STRING },
          beats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                body: { type: Type.STRING }
              },
              required: ["title", "body"]
            }
          }
        },
        required: ["title", "deck", "beats"]
      }
    },
    required: ["slug", "text", "personId", "sourceWorkId", "verificationStatus", "confidence", "contextNote", "storyTrail"]
  }
};

async function generateBatch(batchNum: number) {
  console.log(`Generating batch ${batchNum}...`);

  const existingFiles = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
  const existingSlugs = existingFiles.map(f => f.replace('.json', ''));

  const prompt = `
Generate 10 completely unique, famous historical misquotes, legendary quotes, or common historical misconceptions.
They MUST NOT be in this list of recently generated ones: ${existingSlugs.slice(-100).join(', ')}.
Find their true provenance and write an engaging 'Story Trail' anecdote for each.
STRICTLY adhere to the brand voice rules defined here:
${brandVoice.substring(0, 1500)}

Format the output strictly as the provided JSON schema.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.9,
      }
    });

    const quotes = JSON.parse(response.text!);
    console.log(`Generated ${quotes.length} quotes. Fetching vectors...`);

    for (const q of quotes) {
      try {
        const embedRes = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: q.text
        });

        q.textEmbedding = embedRes.embeddings[0].values;

        const filePath = path.join(queueDir, `${q.slug}.json`);
        fs.writeFileSync(filePath, JSON.stringify(q, null, 2));
        console.log(`Saved: ${q.slug}.json`);
      } catch (e) {
        console.error(`Error embedding quote ${q.slug}`, e);
      }
    }

    return quotes.length;
  } catch (e) {
    console.error("Batch failed:", e);
    return 0;
  }
}

async function main() {
  let totalGenerated = fs.readdirSync(queueDir).filter(f => f.endsWith('.json')).length;
  console.log(`Starting swarm generator. Current total: ${totalGenerated}`);

  let batchNum = 1;
  while (totalGenerated < 1000) {
    const count = await generateBatch(batchNum);
    totalGenerated += count;
    batchNum++;
    console.log(`Total generated: ${totalGenerated}`);

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("Goal of 1000 quotes reached!");
}

main().catch(console.error);
