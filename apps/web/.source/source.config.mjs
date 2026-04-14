import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  // Pointing the engine to the freshly aligned physical folder
  dir: "content/publish",
});

export default defineConfig();