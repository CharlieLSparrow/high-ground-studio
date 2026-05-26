import path from "node:path";
import { fileURLToPath } from "node:url";

const quiploreDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(quiploreDir, "../..");

/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  transpilePackages: ["@high-ground/quipsly-domain"],
  turbopack: {
    root: repoRoot,
  },
};

export default config;
