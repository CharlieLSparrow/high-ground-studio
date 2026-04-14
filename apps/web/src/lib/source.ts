import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  // The engine now knows its true home. No more /docs.
  baseUrl: "/episodes",
  source: docs.toFumadocsSource(),
});