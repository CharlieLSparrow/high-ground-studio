import path from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(studioDir, "../..");
const ignoreBuildTypeErrors =
  process.env.QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS === "1";
const buildDistDir = process.env.QUIPSLY_BUILD_DIST_DIR || ".next";
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
    ignoreBuildErrors: ignoreBuildTypeErrors,
  },
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
