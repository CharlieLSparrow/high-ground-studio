import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  // This tells the UI that all paths start with /episodes
  baseUrl: "/episodes",
  source: docs.toFumadocsSource(),
});