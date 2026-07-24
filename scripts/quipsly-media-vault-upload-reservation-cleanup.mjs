#!/usr/bin/env node

import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const apply = process.argv.includes("--apply");
const confirmation = process.argv.find((argument) => argument.startsWith("--confirm="))?.split("=", 2)[1] || "";
if (apply && confirmation !== "EXPIRE_UPLOAD_RESERVATIONS") {
  throw new Error("Apply requires --confirm=EXPIRE_UPLOAD_RESERVATIONS.");
}

const parsedAbandonHours = Number(process.env.QUIPSLY_UPLOAD_ABANDON_AFTER_HOURS || 24);
const abandonAfterHours = Number.isSafeInteger(parsedAbandonHours) && parsedAbandonHours > 0
  ? parsedAbandonHours
  : 24;
const now = new Date();
const abandonBefore = new Date(now.getTime() - abandonAfterHours * 60 * 60 * 1_000);
const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
  log: ["error"],
});

try {
  const [expirable, abandonable] = await Promise.all([
    prisma.mediaVaultUploadReservation.count({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
    }),
    prisma.mediaVaultUploadReservation.count({
      where: { status: "EXPIRED", expiresAt: { lte: abandonBefore } },
    }),
  ]);

  if (!apply) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "dry-run",
      now: now.toISOString(),
      abandonBefore: abandonBefore.toISOString(),
      expirable,
      abandonable,
      deletesDatabaseRows: false,
      deletesGcsObjects: false,
    }, null, 2)}\n`);
  } else {
    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended('quipsly-upload-reservation-cleanup', 0))`;
      const expired = await transaction.mediaVaultUploadReservation.updateMany({
        where: { status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED", expiredAt: now },
      });
      const abandoned = await transaction.mediaVaultUploadReservation.updateMany({
        where: { status: "EXPIRED", expiresAt: { lte: abandonBefore } },
        data: {
          status: "ABANDONED",
          abandonedAt: now,
          abandonedReason: "Upload capability expired without a verified completion receipt.",
        },
      });
      return { expired: expired.count, abandoned: abandoned.count };
    }, { isolationLevel: "Serializable" });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "apply",
      now: now.toISOString(),
      ...result,
      deletesDatabaseRows: false,
      deletesGcsObjects: false,
    }, null, 2)}\n`);
  }
} finally {
  await prisma.$disconnect();
}
