import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["@high-ground/worldhub-domain"],
};

const withMDX = createMDX();

export default withMDX(config);
