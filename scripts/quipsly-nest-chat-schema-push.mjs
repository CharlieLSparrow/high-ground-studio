import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
  log: ["error"],
});

async function execute(label, sql, options = {}) {
  process.stdout.write(`Applying ${label}...\n`);
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const message = String(error?.message ?? error);
    const ignorable =
      options.ignoreDuplicate &&
      (message.includes("already exists") ||
        message.includes("duplicate key") ||
        message.includes("duplicate_object") ||
        message.includes("relation \"") ||
        message.includes("constraint \""));

    if (!ignorable) throw error;
    process.stdout.write(`Skipping ${label}; already exists.\n`);
  }
}

async function syncProjectAccessGrants() {
  await execute(
    "StudioProjectAccessRole enum",
    `CREATE TYPE "StudioProjectAccessRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');`,
    { ignoreDuplicate: true },
  );

  await execute(
    "StudioProjectAccessStatus enum",
    `CREATE TYPE "StudioProjectAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');`,
    { ignoreDuplicate: true },
  );

  await execute(
    "StudioProjectAccessGrant table",
    `
CREATE TABLE IF NOT EXISTS "StudioProjectAccessGrant" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "StudioProjectAccessRole" NOT NULL DEFAULT 'VIEWER',
  "status" "StudioProjectAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "createdByEmail" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioProjectAccessGrant_pkey" PRIMARY KEY ("id")
);
    `,
  );

  await execute(
    "StudioProjectAccessGrant unique project/email",
    `CREATE UNIQUE INDEX IF NOT EXISTS "StudioProjectAccessGrant_projectId_email_key" ON "StudioProjectAccessGrant"("projectId", "email");`,
  );

  await execute(
    "StudioProjectAccessGrant email/status index",
    `CREATE INDEX IF NOT EXISTS "StudioProjectAccessGrant_email_status_idx" ON "StudioProjectAccessGrant"("email", "status");`,
  );

  await execute(
    "StudioProjectAccessGrant project/status index",
    `CREATE INDEX IF NOT EXISTS "StudioProjectAccessGrant_projectId_status_idx" ON "StudioProjectAccessGrant"("projectId", "status");`,
  );

  await execute(
    "StudioProjectAccessGrant project foreign key",
    `ALTER TABLE "StudioProjectAccessGrant" ADD CONSTRAINT "StudioProjectAccessGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    { ignoreDuplicate: true },
  );

  await execute(
    "StudioProjectAccessGrant createdBy foreign key",
    `ALTER TABLE "StudioProjectAccessGrant" ADD CONSTRAINT "StudioProjectAccessGrant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
    { ignoreDuplicate: true },
  );
}

async function main() {
  await syncProjectAccessGrants();
  await execute(
    "StudioNestChatThread table",
    `
CREATE TABLE IF NOT EXISTS "StudioNestChatThread" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "title" TEXT NOT NULL DEFAULT 'Nest Chat',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioNestChatThread_pkey" PRIMARY KEY ("id")
);
    `,
  );

  await execute(
    "StudioNestChatMessage table",
    `
CREATE TABLE IF NOT EXISTS "StudioNestChatMessage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "authorEmail" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "gifUrl" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioNestChatMessage_pkey" PRIMARY KEY ("id")
);
    `,
  );

  await execute(
    "StudioNestChatThread unique key",
    `
CREATE UNIQUE INDEX IF NOT EXISTS "StudioNestChatThread_projectId_key_key"
ON "StudioNestChatThread"("projectId", "key");
    `,
  );

  await execute(
    "StudioNestChatThread updated index",
    `
CREATE INDEX IF NOT EXISTS "StudioNestChatThread_projectId_updatedAt_idx"
ON "StudioNestChatThread"("projectId", "updatedAt");
    `,
  );

  await execute(
    "StudioNestChatMessage project index",
    `
CREATE INDEX IF NOT EXISTS "StudioNestChatMessage_projectId_createdAt_idx"
ON "StudioNestChatMessage"("projectId", "createdAt");
    `,
  );

  await execute(
    "StudioNestChatMessage thread index",
    `
CREATE INDEX IF NOT EXISTS "StudioNestChatMessage_threadId_createdAt_idx"
ON "StudioNestChatMessage"("threadId", "createdAt");
    `,
  );

  await execute(
    "StudioNestChatThread project foreign key",
    `
DO $$
BEGIN
  ALTER TABLE "StudioNestChatThread"
    ADD CONSTRAINT "StudioNestChatThread_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
    `,
  );

  await execute(
    "StudioNestChatMessage project foreign key",
    `
DO $$
BEGIN
  ALTER TABLE "StudioNestChatMessage"
    ADD CONSTRAINT "StudioNestChatMessage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
    `,
  );

  await execute(
    "StudioNestChatMessage thread foreign key",
    `
DO $$
BEGIN
  ALTER TABLE "StudioNestChatMessage"
    ADD CONSTRAINT "StudioNestChatMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "StudioNestChatThread"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
    `,
  );

  process.stdout.write("Nest chat schema is synchronized.\n");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
