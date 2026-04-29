import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";

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

// What this does:
// Published episode MDX is enabled by default. The explicit opt-out is here so
// we can still kill the loader quickly if it misbehaves in production, but the
// normal public path should not depend on a secret env flag being remembered.
//
// Future complexity wearing a fake mustache:
// "It's just one environment variable" usually arrives dressed as safety and
// quietly turns into "why is production serving the fallback instead of the real
// content?" Default-on plus explicit opt-out is the less surprising contract for
// published material.
export const isEpisodeLoaderEnabled =
  process.env.ENABLE_EPISODES_FUMADOCS !== "0";

export async function getEpisodeSource(): Promise<EpisodeSource> {
  if (!isEpisodeLoaderEnabled) {
    return emptyEpisodeSource;
  }

  try {
    return loader({
      baseUrl: "/episodes",
      source: docs.toFumadocsSource() as LoaderSourceArg,
    }) as EpisodeSource;
  } catch {
    return emptyEpisodeSource;
  }
}
