import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  // 👈 We point it to 'docs' because your 'ls' command proved that's where the files live.
  dir: "content/docs", 
});

export default defineConfig();