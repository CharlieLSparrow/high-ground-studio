import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Server } from "@hocuspocus/server";
import { Pool } from "pg";
import * as Y from "yjs";

const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL || "";
const TOKEN_SECRET =
  process.env.STUDIO_COLLAB_TOKEN_SECRET || process.env.AUTH_SECRET || "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Studio Collab.");
}

if (!TOKEN_SECRET) {
  throw new Error("STUDIO_COLLAB_TOKEN_SECRET or AUTH_SECRET is required.");
}

const pool = new Pool({ connectionString: DATABASE_URL });

function base64UrlSign(input, secret) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function verifyToken(token) {
  const parts = String(token ?? "").split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expected = base64UrlSign(`${header}.${payload}`, TOKEN_SECRET);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  let decoded;

  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof decoded.roomName !== "string" ||
    typeof decoded.email !== "string" ||
    (decoded.actorId !== "charlie" && decoded.actorId !== "homer") ||
    decoded.role !== "editor" ||
    typeof decoded.exp !== "number" ||
    decoded.exp * 1000 <= Date.now()
  ) {
    return null;
  }

  return decoded;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "StudioManuscriptCollaborationRoom" (
      "id" TEXT PRIMARY KEY,
      "roomName" TEXT NOT NULL UNIQUE,
      "title" TEXT NOT NULL,
      "seedSnapshotId" TEXT,
      "seededAt" TIMESTAMP(3),
      "seededByEmail" TEXT,
      "lastCheckpointSnapshotId" TEXT,
      "ydocState" BYTEA,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "StudioManuscriptCollaborationRoom_updatedAt_idx"
    ON "StudioManuscriptCollaborationRoom"("updatedAt")
  `);
}

async function loadDocument(documentName) {
  const result = await pool.query(
    `SELECT "ydocState" FROM "StudioManuscriptCollaborationRoom" WHERE "roomName" = $1`,
    [documentName],
  );
  const document = new Y.Doc();
  const state = result.rows[0]?.ydocState;

  if (state) {
    Y.applyUpdate(document, new Uint8Array(state));
  }

  if (!result.rows.length) {
    await pool.query(
      `INSERT INTO "StudioManuscriptCollaborationRoom" ("id", "roomName", "title")
       VALUES ($1, $2, $3)
       ON CONFLICT ("roomName") DO NOTHING`,
      [`collab_${randomUUID()}`, documentName, "Untitled manuscript"],
    );
  }

  return document;
}

async function storeDocument(documentName, document) {
  const state = Buffer.from(Y.encodeStateAsUpdate(document));

  await pool.query(
    `INSERT INTO "StudioManuscriptCollaborationRoom"
      ("id", "roomName", "title", "ydocState", "updatedAt")
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT ("roomName") DO UPDATE SET
      "ydocState" = EXCLUDED."ydocState",
      "updatedAt" = CURRENT_TIMESTAMP`,
    [`collab_${randomUUID()}`, documentName, "Untitled manuscript", state],
  );
}

await ensureSchema();

const hocuspocus = new Server({
  port: PORT,
  name: "high-ground-studio-collab",
  timeout: 30_000,
  debounce: 1_000,
  maxDebounce: 10_000,
  async onAuthenticate({ token, documentName }) {
    const payload = verifyToken(token);

    if (!payload || payload.roomName !== documentName) {
      throw new Error("Unauthorized Studio collaboration connection.");
    }

    return payload;
  },
  async onLoadDocument({ documentName }) {
    return loadDocument(documentName);
  },
  async onStoreDocument({ documentName, document }) {
    await storeDocument(documentName, document);
  },
  async onRequest({ request, response }) {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          service: "high-ground-studio-collab",
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
  },
});

await hocuspocus.listen(undefined, () => {
  console.log(`Studio Collab listening on ${PORT}`);
});
