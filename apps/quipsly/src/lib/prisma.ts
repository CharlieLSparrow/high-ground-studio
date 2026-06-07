import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForStudioPrisma = globalThis as unknown as {
  studioPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const poolMax = Number.parseInt(process.env.PRISMA_PG_POOL_MAX ?? "2", 10);
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  const prisma =
    globalForStudioPrisma.studioPrisma ??
    new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

  globalForStudioPrisma.studioPrisma = prisma;

  return prisma;
}
