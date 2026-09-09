import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBuildTypescriptConfig } from "./scripts/typescript-config.mjs";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(studioDir, "../..");
const ignoreBuildTypeErrors =
  process.env.QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS === "1";
const buildDistDir = process.env.QUIPSLY_BUILD_DIST_DIR || ".next";
const disableWebpackCache = process.env.QUIPSLY_DISABLE_WEBPACK_CACHE === "1";
if (!/^\.next(?:-[a-z0-9]+)*$/.test(buildDistDir)) {
  throw new Error(
    "QUIPSLY_BUILD_DIST_DIR must name a project-local .next directory.",
  );
}
const configuredDevOrigins = (process.env.QUIPSLY_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(
    (value) =>
      value.length > 0 &&
      value.length <= 253 &&
      !value.includes("://") &&
      !/[/:?#@\s]/.test(value),
  );
const allowedDevOrigins = [
  ...new Set(["127.0.0.1", "localhost", ...configuredDevOrigins]),
];

/** @type {import('next').NextConfig} */
const config = {
  distDir: buildDistDir,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  allowedDevOrigins,
  reactStrictMode: true,
  // A native workflow uses more routes than a single browser page. Next's
  // one-minute development expiry can evict login while later startup routes
  // are still compiling. Retain that working set without changing production
  // caching, request timeouts, or authentication behavior.
  onDemandEntries: {
    maxInactiveAge: 35 * 60 * 1000,
    pagesBufferLength: 32,
  },
  logging: {
    incomingRequests: {
      // Calendar subscription URLs are bearer capabilities. Keep their paths out
      // of Next.js request logs while retaining request logging everywhere else.
      ignore: [/^\/api\/calendar\/feeds\/[^/?#]+(?:[/?#]|$)/],
    },
  },
  transpilePackages: [
    "@high-ground/content-studio-domain",
    "@high-ground/quipsly-document-kernel",
    "@high-ground/quipsly-media-processing",
    "@high-ground/studio-domain",
  ],
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
  ],
  typescript: {
    tsconfigPath: ensureBuildTypescriptConfig(buildDistDir),
    ignoreBuildErrors: ignoreBuildTypeErrors,
  },
  webpack(webpackConfig) {
    // Local release verification must remain possible on a constrained disk.
    // This only removes rebuild acceleration; it does not change emitted code.
    if (disableWebpackCache) webpackConfig.cache = false;
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
