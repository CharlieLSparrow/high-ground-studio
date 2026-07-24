import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(webDir, "../..");
const ignoreBuildTypeErrors = process.env.WEB_DOCKER_IGNORE_TYPE_ERRORS === "1";
const buildDistDir = process.env.WEB_BUILD_DIST_DIR || ".next";
if (!/^\.next(?:-[a-z0-9]+)*$/.test(buildDistDir)) {
  throw new Error("WEB_BUILD_DIST_DIR must name a project-local .next directory.");
}

/** @type {import('next').NextConfig} */
const config = {
  distDir: buildDistDir,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  transpilePackages: ["@high-ground/worldhub-domain"],
  typescript: {
    ignoreBuildErrors: ignoreBuildTypeErrors,
  },
};

const withMDX = createMDX();

export default withMDX(config);
