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

  const adapter = new PrismaPg(connectionString);

  const prisma =
    globalForStudioPrisma.studioPrisma ??
    new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

  if (process.env.NODE_ENV !== "production") {
    globalForStudioPrisma.studioPrisma = prisma;
  }

  return prisma;
}
