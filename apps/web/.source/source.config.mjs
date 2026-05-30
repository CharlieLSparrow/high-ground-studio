// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
var episodes = defineDocs({
  dir: "content/publish/episodes"
});
var learn = defineDocs({
  dir: "content/publish/learn"
});
var news = defineDocs({
  dir: "content/publish/news"
});
var source_config_default = defineConfig();
export {
  source_config_default as default,
  episodes,
  learn,
  news
};
