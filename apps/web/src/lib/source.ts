import { loader } from "fumadocs-core/source";

const guardedImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<unknown>;

type EpisodeSource = ReturnType<typeof loader>;
type LoaderSourceArg = Parameters<typeof loader>[0]["source"];

const emptyEpisodeSource = {
  getPage() {
    return null;
  },
  getPages() {
    return [];
  },
} as EpisodeSource;

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
  });
}