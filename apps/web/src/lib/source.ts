import { loader } from "fumadocs-core/source";

const guardedImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<any>;

type EpisodeSource = {
  getPage: (segments: string[]) => any | null;
  getPages: () => Array<{ slugs: string[] }>;
};

const emptyEpisodeSource: EpisodeSource = {
  getPage() {
    return null;
  },
  getPages() {
    return [];
  },
};

export const isEpisodeLoaderEnabled =
  process.env.ENABLE_EPISODES_FUMADOCS === "1";

export async function getEpisodeSource(): Promise<EpisodeSource> {
  if (!isEpisodeLoaderEnabled) {
    return emptyEpisodeSource;
  }

  const [{ docs }] = await Promise.all([
    guardedImport("fumadocs-mdx:collections/server") as Promise<{
      docs: { toFumadocsSource: () => unknown };
    }>,
  ]);

  return loader({
    baseUrl: "/episodes",
    source: docs.toFumadocsSource(),
  });
}
