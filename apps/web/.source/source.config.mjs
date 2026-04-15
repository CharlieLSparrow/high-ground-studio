// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
var docs = defineDocs({
  // This MUST match the folder name you see in your VS Code sidebar
  dir: "content/publish"
});
var source_config_default = defineConfig();
export {
  source_config_default as default,
  docs
};
