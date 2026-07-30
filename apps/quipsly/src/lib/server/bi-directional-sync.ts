import { getPrismaClient } from "@/lib/prisma";
import {
  ensureHomeNestForEmail,
  homeNestSlugForEmail,
} from "@/lib/server/home-nest";
import {
  sourceLabelForNestKind,
  STUDIO_WORKSPACE_SLUG,
} from "@/lib/studio/project-registry";

export const QUIPSLY_NATIVE_NOTE_SOURCE_LABEL = "quipsly-native-note";

/**
 * Projects an authenticated user's QuipslyNote into private Home Nest blocks.
 *
 * expectedUserId is mandatory because note IDs originate on clients. Ownership
 * is checked again here—even when the caller already checked it—so a future
 * call site cannot turn a guessed UUID into a cross-tenant document mutation.
 */
export async function parseQuipslyNoteToBlocks(
  noteId: string,
  expectedUserId: string,
) {
  if (!expectedUserId.trim()) {
    throw new Error("Expected note owner is required for native note projection.");
  }

  const prisma = getPrismaClient();
  const note = await prisma.quipslyNote.findFirst({
    where: { id: noteId, userId: expectedUserId },
    include: {
      user: { select: { primaryEmail: true } },
    },
  });

  if (!note) {
    throw new Error("Note is unavailable for the expected owner.");
  }

  const ownerEmail = note.user.primaryEmail.trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error("Note owner does not have a usable primary email.");
  }

  // Home Nest provisioning is the canonical path because it creates a private
  // Nest and an explicit OWNER grant. Never recreate the old unowned
  // personal-{userId} workspace/project fallback here.
  const homeNest = await ensureHomeNestForEmail(ownerEmail, prisma);
  const ownerGrant = await prisma.studioProjectAccessGrant.findUnique({
    where: {
      projectId_email: {
        projectId: homeNest.id,
        email: ownerEmail,
      },
    },
    select: { role: true, status: true },
  });

  if (ownerGrant?.role !== "OWNER" || ownerGrant.status !== "ACTIVE") {
    throw new Error("Home Nest owner grant is missing; note projection was refused.");
  }

  let document = await prisma.studioDocument.findUnique({
    where: { stableId: noteId },
  });

  // stableId is global. A native UUID that already belongs to any other Nest
  // must fail closed rather than adopting or rewriting that document.
  if (
    document &&
    (document.projectId !== homeNest.id ||
      document.sourceLabel !== QUIPSLY_NATIVE_NOTE_SOURCE_LABEL ||
      document.personalOwnerUserId !== expectedUserId)
  ) {
    throw new Error("Note projection stableId belongs to another document or Nest.");
  }

  const documentTitle = note.title || "Untitled Note";
  if (!document) {
    document = await prisma.studioDocument.create({
      data: {
        projectId: homeNest.id,
        personalOwnerUserId: expectedUserId,
        stableId: noteId,
        title: documentTitle,
        sourceLabel: QUIPSLY_NATIVE_NOTE_SOURCE_LABEL,
        projectionStatus: "private",
        isPrivate: true,
      },
    });
  } else {
    const updated = await prisma.studioDocument.updateMany({
      where: {
        id: document.id,
        projectId: homeNest.id,
        personalOwnerUserId: expectedUserId,
      },
      data: {
        personalOwnerUserId: expectedUserId,
        title: documentTitle,
        sourceLabel: QUIPSLY_NATIVE_NOTE_SOURCE_LABEL,
        projectionStatus: "private",
        isPrivate: true,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Note projection document changed Nest during update.");
    }
    document.title = documentTitle;
    document.sourceLabel = QUIPSLY_NATIVE_NOTE_SOURCE_LABEL;
    document.projectionStatus = "private";
    document.isPrivate = true;
  }

  const rawBlocks = note.content
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0);
  const existingBlocks = await prisma.studioDocumentBlock.findMany({
    where: { documentId: document.id },
    orderBy: { order: "asc" },
  });
  const existingPool = [...existingBlocks];
  const matchedExistingIds = new Set<string>();

  const resolvedBlocks = rawBlocks.map((bodyText, index) => {
    const cleanBody = bodyText.trim();
    const title = cleanBody.startsWith("#")
      ? cleanBody.replace(/^#+\s*/, "")
      : null;
    let bestMatchIndex = existingPool.findIndex(
      (existing) =>
        !matchedExistingIds.has(existing.id) && existing.body === cleanBody,
    );

    if (bestMatchIndex === -1) {
      if (
        index < existingPool.length &&
        !matchedExistingIds.has(existingPool[index].id)
      ) {
        bestMatchIndex = index;
      } else {
        bestMatchIndex = existingPool.findIndex(
          (existing) => !matchedExistingIds.has(existing.id),
        );
      }
    }

    const existingBlock =
      bestMatchIndex === -1 ? null : existingPool[bestMatchIndex];
    if (existingBlock) matchedExistingIds.add(existingBlock.id);

    return {
      existingBlock,
      order: index * 1000,
      title,
      body: cleanBody,
    };
  });

  const blocksToDelete = existingPool.filter(
    (block) => !matchedExistingIds.has(block.id),
  );
  const projectionSeed = Date.now();

  await prisma.$transaction(async (tx) => {
    if (blocksToDelete.length > 0) {
      await tx.studioDocumentBlock.deleteMany({
        where: {
          documentId: document.id,
          id: { in: blocksToDelete.map((block) => block.id) },
        },
      });
    }

    for (const resolved of resolvedBlocks) {
      if (resolved.existingBlock) {
        await tx.studioDocumentBlock.update({
          where: { id: resolved.existingBlock.id },
          data: {
            title: resolved.title,
            body: resolved.body,
            order: resolved.order,
            projectionStatus: "private",
            isPrivate: true,
          },
        });
      } else {
        await tx.studioDocumentBlock.create({
          data: {
            documentId: document.id,
            stableId: `block-${projectionSeed}-${resolved.order}`,
            order: resolved.order,
            title: resolved.title,
            body: resolved.body,
            projectionStatus: "private",
            isPrivate: true,
          },
        });
      }
    }

    await tx.studioTaggedSpan.deleteMany({
      where: { documentId: document.id },
    });

    if (note.tags.length > 0) {
      const firstBlock = await tx.studioDocumentBlock.findFirst({
        where: { documentId: document.id },
        orderBy: { order: "asc" },
      });

      if (firstBlock) {
        for (const tagName of note.tags) {
          const tagSlug = tagName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          if (!tagSlug) continue;

          const tag = await tx.studioTag.upsert({
            where: {
              projectId_slug: { projectId: document.projectId, slug: tagSlug },
            },
            update: {},
            create: {
              projectId: document.projectId,
              slug: tagSlug,
              label: tagName,
              category: "meaning",
            },
          });

          await tx.studioTaggedSpan.create({
            data: {
              documentId: document.id,
              blockId: firstBlock.id,
              tagId: tag.id,
              startOffset: 0,
              endOffset: firstBlock.body.length,
              selectedText: firstBlock.body.substring(0, 50),
              documentStableId: document.stableId,
              documentTitleSnapshot: document.title,
              blockStableId: firstBlock.stableId,
            },
          });
        }
      }
    }
  });

  return document.id;
}

export type ReverseNoteSyncReceipt =
  | {
      status: "skipped";
      reason: "not-native-note-document" | "source-note-missing";
      documentId: string;
    }
  | {
      status: "synced";
      documentId: string;
      noteId: string;
      userId: string;
    };

/**
 * Concatenates private native-note blocks into their source QuipslyNote.
 *
 * General Studio documents are intentional no-ops. A document labeled as a
 * native note must prove the full reverse mapping—source note owner, canonical
 * Home Nest identity, and active OWNER grant—before any note mutation.
 */
export async function syncBlocksToQuipslyNote(documentId: string) {
  const prisma = getPrismaClient();

  const document = await prisma.studioDocument.findUnique({
    where: { id: documentId },
    include: {
      project: {
        include: {
          workspace: true,
        },
      },
      blocks: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!document) throw new Error("Document not found");

  if (document.sourceLabel !== QUIPSLY_NATIVE_NOTE_SOURCE_LABEL) {
    return {
      status: "skipped",
      reason: "not-native-note-document",
      documentId,
    } satisfies ReverseNoteSyncReceipt;
  }

  const noteId = document.stableId;
  const note = await prisma.quipslyNote.findUnique({
    where: { id: noteId },
    include: {
      user: { select: { primaryEmail: true } },
    },
  });

  if (!note) {
    return {
      status: "skipped",
      reason: "source-note-missing",
      documentId,
    } satisfies ReverseNoteSyncReceipt;
  }

  const ownerEmail = note.user.primaryEmail.trim().toLowerCase();
  const expectedHomeNestSlug = homeNestSlugForEmail(ownerEmail);
  if (
    !expectedHomeNestSlug ||
    document.personalOwnerUserId !== note.userId ||
    document.project.slug !== expectedHomeNestSlug ||
    document.project.sourceLabel !== sourceLabelForNestKind("home") ||
    document.project.workspace.slug !== STUDIO_WORKSPACE_SLUG
  ) {
    throw new Error(
      "Native note document is outside the source owner's canonical Home Nest.",
    );
  }

  const ownerGrant = await prisma.studioProjectAccessGrant.findUnique({
    where: {
      projectId_email: {
        projectId: document.projectId,
        email: ownerEmail,
      },
    },
    select: { role: true, status: true },
  });
  if (ownerGrant?.role !== "OWNER" || ownerGrant.status !== "ACTIVE") {
    throw new Error(
      "Native note document Home Nest owner grant is missing; reverse sync was refused.",
    );
  }

  const blocksText = document.blocks.map((block) => block.body).join("\n\n");
  const updated = await prisma.quipslyNote.updateMany({
    where: { id: note.id, userId: note.userId },
    data: {
      content: blocksText,
      title: document.title,
      folderName: document.project.name,
    },
  });

  if (updated.count !== 1) {
    throw new Error(
      "Source note changed ownership or disappeared during reverse sync.",
    );
  }

  return {
    status: "synced",
    documentId,
    noteId: note.id,
    userId: note.userId,
  } satisfies ReverseNoteSyncReceipt;
}
