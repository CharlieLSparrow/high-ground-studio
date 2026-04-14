import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  // 👈 This ensures the UI URLs use /episodes, but the internal engine finds the files.
  baseUrl: "/episodes",
  source: docs.toFumadocsSource(),
});