import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
  typeof globalThis === "object" &&
  "process" in globalThis &&
  globalThis.process &&
  typeof globalThis.process === "object" &&
  "env" in globalThis.process &&
  globalThis.process.env &&
  typeof globalThis.process.env === "object" &&
  typeof globalThis.process.env.DATABASE_URL === "string"
    ? globalThis.process.env.DATABASE_URL
    : "";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});