import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const episodes = defineDocs({
  dir: "content/publish/episodes",
});

export const learn = defineDocs({
  dir: "content/publish/learn",
});

export const news = defineDocs({
  dir: "content/publish/news",
});

export default defineConfig();
