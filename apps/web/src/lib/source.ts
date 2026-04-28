import { loader } from "fumadocs-core/source";

const guardedImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<unknown>;

type LoaderSourceArg = Parameters<typeof loader>[0]["source"];

type EpisodeSource = {
  getPage: (segments: string[]) => unknown | null;
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

  const module = (await guardedImport(
    "fumadocs-mdx:collections/server",
  )) as {
    docs: {
      toFumadocsSource: () => LoaderSourceArg;
    };
  };

  return loader({
    baseUrl: "/episodes",
    source: module.docs.toFumadocsSource(),
  }) as EpisodeSource;
}