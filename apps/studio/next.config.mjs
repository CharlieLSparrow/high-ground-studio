import path from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(studioDir, "../..");

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  transpilePackages: ["@high-ground/studio-domain"],
};

export default config;
