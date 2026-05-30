import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForStudioPrisma = globalThis as unknown as {
  studioPrisma?: PrismaClient;
  studioPgPool?: Pool;
};

export function getPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool =
    globalForStudioPrisma.studioPgPool ??
    new Pool({
      connectionString,
    });

  const adapter = new PrismaPg(pool);

  const prisma =
    globalForStudioPrisma.studioPrisma ??
    new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

  if (process.env.NODE_ENV !== "production") {
    globalForStudioPrisma.studioPgPool = pool;
    globalForStudioPrisma.studioPrisma = prisma;
  }

  return prisma;
}
