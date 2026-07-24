import type { Prisma } from "@prisma/client";

import { resolveReusableProjectTag } from "./work-tags";

export type QuickEntryTag = {
  id: string;
  slug: string;
  label: string;
};

export type ResolveQuickEntryTagsResult =
  | {
      kind: "resolved";
      tags: QuickEntryTag[];
      createdTagCount: number;
      reusedTagCount: number;
    }
  | { kind: "invalid-tags" }
  | { kind: "tag-creation-forbidden" }
  | { kind: "archived-tag"; label: string }
  | { kind: "tag-slug-conflict"; label: string; existingLabel: string };

/**
 * Resolve existing and newly named tags to one canonical Nest vocabulary.
 * Callers still own record authorization; this helper additionally rechecks
 * active Owner/Editor access before it can expand the shared vocabulary.
 */
export async function resolveQuickEntryTags(input: {
  tx: Prisma.TransactionClient;
  projectId: string | null;
  actorEmail: string;
  tagIds: string[];
  newTagLabels: string[];
}): Promise<ResolveQuickEntryTagsResult> {
  if ((input.tagIds.length > 0 || input.newTagLabels.length > 0) && !input.projectId) {
    return { kind: "invalid-tags" };
  }

  const selected = input.tagIds.length > 0
    ? await input.tx.studioTag.findMany({
        where: {
          id: { in: input.tagIds },
          projectId: input.projectId ?? undefined,
          isActive: true,
        },
        select: { id: true, slug: true, label: true },
      })
    : [];
  if (selected.length !== input.tagIds.length) return { kind: "invalid-tags" };

  if (input.newTagLabels.length > 0) {
    const activeGrant = await input.tx.studioProjectAccessGrant.findFirst({
      where: {
        projectId: input.projectId ?? "",
        email: input.actorEmail,
        status: "ACTIVE",
        role: { in: ["OWNER", "EDITOR"] },
      },
      select: { id: true },
    });
    if (!activeGrant) return { kind: "tag-creation-forbidden" };
  }

  const tagsById = new Map(selected.map((tag) => [tag.id, tag]));
  let createdTagCount = 0;
  for (const requestedLabel of input.newTagLabels) {
    const resolved = await resolveReusableProjectTag({
      tx: input.tx,
      projectId: input.projectId ?? "",
      label: requestedLabel,
    });
    if (!resolved.ok) {
      if (resolved.code === "ARCHIVED") {
        return { kind: "archived-tag", label: requestedLabel };
      }
      if (resolved.code === "SLUG_CONFLICT") {
        return {
          kind: "tag-slug-conflict",
          label: requestedLabel,
          existingLabel: resolved.existingLabel,
        };
      }
      return { kind: "invalid-tags" };
    }
    if (resolved.created) createdTagCount += 1;
    tagsById.set(resolved.tag.id, {
      id: resolved.tag.id,
      slug: resolved.tag.slug,
      label: resolved.tag.label,
    });
  }

  return {
    kind: "resolved",
    tags: [...tagsById.values()].sort((left, right) => left.label.localeCompare(right.label)),
    createdTagCount,
    reusedTagCount: input.newTagLabels.length - createdTagCount,
  };
}
