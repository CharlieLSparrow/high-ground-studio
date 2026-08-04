import "server-only";

import { normalizeSessionPurpose } from "@/lib/session-experience";

export class SessionEpisodeBindingError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = "SessionEpisodeBindingError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function resolveSessionEpisodeBinding(input: {
  prisma: any;
  projectId: string;
  purpose: unknown;
  episodeSlug: unknown;
}) {
  const purpose = normalizeSessionPurpose(input.purpose);
  const episodeSlug = text(input.episodeSlug);
  if (!episodeSlug) {
    return { episodeProductionId: null, episodeSlug: null, episode: null };
  }
  if (purpose !== "PODCAST") {
    throw new SessionEpisodeBindingError(
      "Only podcast recording Sessions can bind an Episode Room.",
      400,
    );
  }
  if (episodeSlug.length > 200) {
    throw new SessionEpisodeBindingError("The requested episode identifier is too long.", 400);
  }
  const episode = await input.prisma.studioEpisodeProduction.findUnique({
    where: {
      projectId_slug: {
        projectId: input.projectId,
        slug: episodeSlug,
      },
    },
    select: {
      id: true,
      projectId: true,
      slug: true,
      title: true,
    },
  });
  if (!episode) {
    throw new SessionEpisodeBindingError(
      "That episode does not exist in the selected Nest. Create or choose the Episode Room before binding this recording Session.",
    );
  }
  return {
    episodeProductionId: episode.id as string,
    episodeSlug: episode.slug as string,
    episode,
  };
}

export function callRoomEpisodeBindingWhere(input: {
  episodeProductionId: string;
  episodeSlug: string;
}) {
  return {
    OR: [
      { episodeProductionId: input.episodeProductionId },
      {
        episodeProductionId: null,
        metadataJson: {
          path: ["episodeSlug"],
          equals: input.episodeSlug,
        },
      },
    ],
  };
}

export function sessionRelationMatchesProject(input: {
  roomProjectId: string | null | undefined;
  purpose: unknown;
  episode: { projectId?: string | null } | null | undefined;
}) {
  return Boolean(
    normalizeSessionPurpose(input.purpose) === "PODCAST"
    && input.roomProjectId
    && input.episode?.projectId
    && input.roomProjectId === input.episode.projectId,
  );
}
