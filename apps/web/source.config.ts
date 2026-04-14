import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  // This MUST match the folder name you see in your VS Code sidebar
  dir: "content/publish", 
});

export default defineConfig();