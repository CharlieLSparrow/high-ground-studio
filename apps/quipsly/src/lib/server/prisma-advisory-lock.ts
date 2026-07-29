import "server-only";

import type { Prisma } from "@prisma/client";

export async function acquirePrismaAdvisoryTransactionLock(
  prisma: Prisma.TransactionClient,
  key: string,
) {
  // PostgreSQL's lock function returns `void`, which Prisma cannot deserialize
  // directly. Casting it to text preserves the blocking side effect while
  // returning a supported wire type.
  await prisma.$queryRaw`
    SELECT CAST(
      pg_advisory_xact_lock(hashtextextended(${key}, 0))
      AS TEXT
    ) AS "lock"
  `;
}
