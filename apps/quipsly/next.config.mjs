import path from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(studioDir, "../..");
const ignoreBuildTypeErrors = process.env.QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS === "1";

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  transpilePackages: [
    "@high-ground/content-studio-domain",
    "@high-ground/quipsly-document-kernel",
    "@high-ground/studio-domain",
  ],
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
  ],
  typescript: {
    ignoreBuildErrors: ignoreBuildTypeErrors,
  },
};

export default config;
