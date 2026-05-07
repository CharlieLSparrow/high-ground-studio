import "server-only";

import type { StoryDraftClientRecord } from "@/lib/story-drafts";
import { prisma } from "@/lib/prisma";

function buildUserLabel(user: { name: string | null; primaryEmail: string } | null) {
  return user?.name?.trim() || user?.primaryEmail || "Unknown team member";
}

export async function getStoryDraftsForStoryMap({
  storyCandidateIds,
  sourceBlockIds,
}: {
  storyCandidateIds: string[];
  sourceBlockIds: string[];
}): Promise<StoryDraftClientRecord[]> {
  const uniqueStoryCandidateIds = [...new Set(storyCandidateIds.filter(Boolean))];
  const uniqueSourceBlockIds = [...new Set(sourceBlockIds.filter(Boolean))];

  if (
    uniqueStoryCandidateIds.length === 0 &&
    uniqueSourceBlockIds.length === 0
  ) {
    return [];
  }

  const drafts = await prisma.storyDraft.findMany({
    where: {
      OR: [
        uniqueStoryCandidateIds.length > 0
          ? {
              storyCandidateId: {
                in: uniqueStoryCandidateIds,
              },
            }
          : undefined,
        uniqueSourceBlockIds.length > 0
          ? {
              sourceBlockId: {
                in: uniqueSourceBlockIds,
              },
            }
          : undefined,
      ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    take: 300,
    include: {
      createdBy: {
        select: {
          name: true,
          primaryEmail: true,
        },
      },
      updatedBy: {
        select: {
          name: true,
          primaryEmail: true,
        },
      },
    },
  });

  return drafts.map((draft) => ({
    id: draft.id,
    storyCandidateId: draft.storyCandidateId,
    storyCandidateTitle: draft.storyCandidateTitle,
    sourceBlockId: draft.sourceBlockId,
    episodeKey: draft.episodeKey,
    episodeNumber: draft.episodeNumber,
    arrangementKey: draft.arrangementKey,
    title: draft.title,
    body: draft.body,
    notes: draft.notes,
    supportNotes: draft.supportNotes,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    createdByLabel: buildUserLabel(draft.createdBy),
    updatedByLabel: draft.updatedBy ? buildUserLabel(draft.updatedBy) : null,
  }));
}
