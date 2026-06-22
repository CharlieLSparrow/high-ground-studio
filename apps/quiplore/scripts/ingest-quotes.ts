import { initializeApp } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function main() {
  const queueDir = path.join(__dirname, 'ingest-queue');
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log("No quotes to ingest.");
    return;
  }

  for (const file of files) {
    const filePath = path.join(queueDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    console.log(`Ingesting quote: ${data.slug}`);

    try {
      // Execute the InsertQuoteWithVector mutation
      const quoteRes = await dc.executeMutation("InsertQuoteWithVector", {
        slug: data.slug,
        text: data.text,
        personId: data.personId || "system",
        sourceWorkId: data.sourceWorkId || "system",
        verificationStatus: data.verificationStatus || "verified",
        confidence: data.confidence || 0.9,
        contextNote: data.contextNote || "Ingested by AI"
      });

      const quoteId = quoteRes.data.quote_insert;

      if (data.storyTrail) {
        console.log(`Ingesting story trail for quote ${quoteId}...`);
        const trailRes = await dc.executeMutation("InsertStoryTrail", {
          quoteId: quoteId,
          slug: data.storyTrail.slug || (data.slug + "-story"),
          title: data.storyTrail.title,
          deck: data.storyTrail.deck
        });

        const trailId = trailRes.data.storyTrail_insert;

        if (data.storyTrail.beats && data.storyTrail.beats.length > 0) {
          for (let i = 0; i < data.storyTrail.beats.length; i++) {
            const beat = data.storyTrail.beats[i];
            await dc.executeMutation("InsertStoryBeat", {
              storyTrailId: trailId,
              orderIndex: i,
              title: beat.title,
              body: beat.body
            });
          }
        }
      }

      console.log(`Successfully ingested quote: ${data.slug}`);
      fs.renameSync(filePath, filePath + '.done');
    } catch (e: any) {
      console.error(`Failed to ingest ${data.slug}:`, e);
      if (e.httpResponse?.data?.errors) {
        console.error("GraphQL Errors:", JSON.stringify(e.httpResponse.data.errors, null, 2));
      }
    }
  }
}

main().catch(console.error);
