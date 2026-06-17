import { getPrismaClient } from "@/lib/prisma";

/**
 * Parses continuous text from a QuipslyNote into StudioDocumentBlocks.
 * This is called whenever the Native app pushes text changes to the server.
 */
export async function parseQuipslyNoteToBlocks(noteId: string) {
  const prisma = getPrismaClient();

  const note = await prisma.quipslyNote.findUnique({
    where: { id: noteId },
  });

  if (!note) throw new Error("Note not found");

  // We need a StudioDocument for this Note.
  // For bi-directional sync, a QuipslyNote and a StudioDocument can share the same ID or Stable ID.
  // Let's ensure a StudioDocument exists with the stableId = noteId
  let document = await prisma.studioDocument.findUnique({
    where: { stableId: noteId }
  });

  if (!document) {
    // If no document exists, create it in a default project for the user, 
    // or just leave it for now. For QuipslyNotes, it might not need a "Project" yet,
    // but the schema requires projectId.
    // We will look up a default "Personal Notes" project.
    // Find or create workspace first
    let workspace = await prisma.studioWorkspace.findFirst({
      where: { slug: `personal-${note.userId}` }
    });
    
    if (!workspace) {
      workspace = await prisma.studioWorkspace.create({
        data: {
          slug: `personal-${note.userId}`,
          name: "Personal Workspace",
          isPrivate: true,
        }
      });
    }

    const projectName = note.folderName || "Quipsly Notes";
    let defaultProject = await prisma.studioProject.findFirst({
      where: { workspaceId: workspace.id, isPrivate: true, name: projectName }
    });

    if (!defaultProject) {
      defaultProject = await prisma.studioProject.create({
        data: {
          workspaceId: workspace.id,
          slug: `quipsly-notes-${note.userId}-${Date.now()}`,
          name: projectName,
          isPrivate: true,
        }
      });
    }

    document = await prisma.studioDocument.create({
      data: {
        projectId: defaultProject.id,
        stableId: noteId,
        title: note.title || "Untitled Note",
        isPrivate: true,
      }
    });
  } else {
    // Update title
    await prisma.studioDocument.update({
      where: { id: document.id },
      data: { title: note.title }
    });
  }

  const rawBlocks = note.content.split(/\n\s*\n/).filter(b => b.trim().length > 0);

  const existingBlocks = await prisma.studioDocumentBlock.findMany({
    where: { documentId: document.id },
    orderBy: { order: "asc" }
  });

  const existingPool = [...existingBlocks];
  const matchedExistingIds = new Set<string>();
  
  const resolvedBlocks = rawBlocks.map((bodyText, index) => {
    const isHeading = bodyText.trim().startsWith('#');
    let title = null;
    let cleanBody = bodyText.trim();
    
    if (isHeading) {
        title = cleanBody.replace(/^#+\s*/, '');
    }

    let bestMatchIdx = -1;

    // 1. Exact match
    for (let j = 0; j < existingPool.length; j++) {
       const existing = existingPool[j];
       if (matchedExistingIds.has(existing.id)) continue;
       if (existing.body === cleanBody) {
           bestMatchIdx = j;
           break;
       }
    }

    // 2. Index match fallback
    if (bestMatchIdx === -1) {
       if (index < existingPool.length && !matchedExistingIds.has(existingPool[index].id)) {
           bestMatchIdx = index;
       } else {
           const firstUnmatched = existingPool.findIndex(e => !matchedExistingIds.has(e.id));
           if (firstUnmatched !== -1) bestMatchIdx = firstUnmatched;
       }
    }

    let action = 'create';
    let existingBlock = null;

    if (bestMatchIdx !== -1) {
        existingBlock = existingPool[bestMatchIdx];
        matchedExistingIds.add(existingBlock.id);
        action = 'update';
    }

    return {
        action,
        existingBlock,
        order: index * 1000,
        title,
        body: cleanBody
    };
  });

  const blocksToDelete = existingPool.filter(e => !matchedExistingIds.has(e.id));

  await prisma.$transaction(async (tx) => {
    // 1. Delete unmatched
    if (blocksToDelete.length > 0) {
      await tx.studioDocumentBlock.deleteMany({
        where: { id: { in: blocksToDelete.map(b => b.id) } }
      });
    }

    // 2. Update existing & Create new
    for (const rb of resolvedBlocks) {
      if (rb.action === 'update' && rb.existingBlock) {
        await tx.studioDocumentBlock.update({
          where: { id: rb.existingBlock.id },
          data: {
            title: rb.title,
            body: rb.body,
            order: rb.order
          }
        });
      } else {
        await tx.studioDocumentBlock.create({
          data: {
            documentId: document.id,
            stableId: `block-${Date.now()}-${rb.order}`,
            order: rb.order,
            title: rb.title,
            body: rb.body,
            isPrivate: false,
          }
        });
      }
    }

    // Handle Tag Sync
    await tx.studioTaggedSpan.deleteMany({
      where: { documentId: document.id }
    });

    if (note.tags && note.tags.length > 0) {
      const firstBlock = await tx.studioDocumentBlock.findFirst({
        where: { documentId: document.id },
        orderBy: { order: "asc" }
      });

      if (firstBlock) {
        for (const tagName of note.tags) {
          const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (!tagSlug) continue;
          const tag = await tx.studioTag.upsert({
            where: { projectId_slug: { projectId: document.projectId, slug: tagSlug } },
            update: {},
            create: {
              projectId: document.projectId,
              slug: tagSlug,
              label: tagName,
              category: "meaning"
            }
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
              documentTitleSnapshot: document.title || "",
              blockStableId: firstBlock.stableId,
            }
          });
        }
      }
    }
  });

  return document.id;
}

/**
 * Concatenates StudioDocumentBlocks into continuous text and updates the QuipslyNote.
 * This is called whenever blocks are edited on the Web.
 */
export async function syncBlocksToQuipslyNote(documentId: string) {
  const prisma = getPrismaClient();

  const document = await prisma.studioDocument.findUnique({
    where: { id: documentId },
    include: {
      project: true,
      blocks: {
        orderBy: { order: "asc" }
      }
    }
  });

  if (!document) throw new Error("Document not found");

  const blocksText = document.blocks.map(b => b.body).join("\n\n");

  // Since we map StudioDocument.stableId = QuipslyNote.id
  const noteId = document.stableId;

  const note = await prisma.quipslyNote.findUnique({
    where: { id: noteId }
  });

  if (!note) {
    // We don't necessarily create a note if one didn't exist natively.
    // Or we could. For now, if the web created it, we might want it to sync down.
    // If we want it to sync down, we'd need userId.
    return;
  }

  await prisma.quipslyNote.update({
    where: { id: noteId },
    data: {
      content: blocksText,
      title: document.title,
      folderName: document.project.name,
    }
  });
}
