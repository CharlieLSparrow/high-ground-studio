// @ts-nocheck
"use server";

import { getPrismaClient } from "@/lib/prisma";
import { ViewDefinition } from "./types";
import { revalidatePath } from "next/cache";
import {
  createManuscriptDraftPlainText,
  safeManuscriptDraft,
} from "../manuscript/manuscript-editor-model";
import { DEFAULT_PROJECT_SLUG, DEV_PROJECT_SLUG, projectConfig } from "./projectConfig";
import { createStarterBlocks } from "./starterDocuments";

const TONIGHT_WORKSPACE_SLUG = "tonight-pack";
const OFFLINE_PROJECT_ID = "offline-quipsly-live";
const OFFLINE_DOCUMENT_ID = "offline-doc-live";

// Make sure these match AVAILABLE_TAGS in ViewFilter/Tagger
const SEED_TAGS = [
  { slug: "quote", label: "Quote", category: "quote" },
  { slug: "social-clip", label: "Social Clip", category: "media" },
  { slug: "educational", label: "Educational", category: "educational" },
  { slug: "internal_note", label: "Internal Note", category: "internal_note" },
  { slug: "chapter", label: "Chapter", category: "chapter" },
  { slug: "media", label: "Media", category: "media" },
  { slug: "episode", label: "Episode", category: "episode" },
  { slug: "episode-4", label: "Episode 4", category: "episode" },
  { slug: "episode-8", label: "Episode 8", category: "episode" },
  { slug: "episode-9", label: "Episode 9", category: "episode" },
  { slug: "voice-homer", label: "Homer", category: "content_role" },
  { slug: "voice-charlie", label: "Charlie", category: "content_role" },
  { slug: "show-note", label: "Show Note", category: "workflow_status" },
  { slug: "clip-cue", label: "Clip Cue", category: "media" },
  { slug: "youtube-clip", label: "YouTube Clip", category: "media" }
];

const TAG_CATEGORY_BY_SLUG = new Map(
  SEED_TAGS.map((tag) => [tag.slug, tag.category])
);

function quipslyCategoryForTag(tag: { slug: string; category?: string | null }) {
  return TAG_CATEGORY_BY_SLUG.get(tag.slug) ?? tag.category ?? "meaning";
}

function studioDbCategoryForQuipslyCategory(category: string) {
  if (category === "chapter" || category === "episode") return "structure";
  if (category === "quote" || category === "educational" || category === "content_role") return "meaning";
  if (category === "media" || category === "social-clip") return "source";
  if (category === "workflow_status" || category === "internal_note") return "review";
  if (["meaning", "structure", "source", "projection", "review"].includes(category)) return category;
  return "meaning";
}

const DEFAULT_VIEW_DEFINITIONS = [
  { name: "Book Mode", type: "review", tagSlugs: [], excludeTagSlugs: ["show-note", "clip-cue", "youtube-clip", "internal_note", "social-clip", "media"], includeCategories: [], displayMode: "standard", showContext: true, collapseUnmatched: false },
  { name: "Episode 4 View", type: "episode", tagSlugs: ["episode-4"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Episode 8 View", type: "episode", tagSlugs: ["episode-8"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Episode 9 View", type: "episode", tagSlugs: ["episode-9"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Show Mode", type: "review", tagSlugs: ["voice-homer", "voice-charlie", "show-note", "clip-cue", "youtube-clip"], includeCategories: ["content_role", "workflow_status", "media"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Quote Database", type: "database", tagSlugs: ["quote"], includeCategories: [], displayMode: "focus", showContext: false, collapseUnmatched: true }
];

function createDefaultViews(idPrefix = "default-view") {
  return DEFAULT_VIEW_DEFINITIONS.map((view, index) => ({
    id: `${idPrefix}-${index}`,
    name: view.name,
    type: view.type,
    filters: { tagSlugs: view.tagSlugs, excludeTagSlugs: view.excludeTagSlugs ?? [], includeCategories: view.includeCategories },
    display: { mode: view.displayMode, showContext: view.showContext, collapseUnmatched: view.collapseUnmatched }
  })) as ViewDefinition[];
}

function createOfflineWorkbenchState(projectSlug = DEFAULT_PROJECT_SLUG) {
  const config = projectConfig(projectSlug);
  const blocks = [
    { id: "offline-preface", text: "Preface", tags: ["chapter", "voice-homer"] },
    { id: "offline-episode-4", text: "Episode 4 scratchpad. Paste tonight's edit here, highlight important ranges, and use the sidebar lenses to focus.", tags: ["episode-4", "voice-homer"] },
    { id: "offline-episode-8-heading", text: "Episode 8", tags: ["episode-8"] },
    { id: "offline-episode-8", text: "Episode 8 writing lane. This fallback proves the workbench can load without a database, but it will not persist changes.", tags: ["episode-8", "voice-charlie", "show-note"] },
    { id: "offline-episode-9-heading", text: "Episode 9", tags: ["episode-9"] },
    { id: "offline-episode-9", text: "Episode 9 writing lane. In production this same screen should use StudioDocumentBlock and StudioTaggedSpan records.", tags: ["episode-9"] },
    { id: "offline-quote", text: "A tagged quote can be a tiny range inside the manuscript, not a separate destructive document.", tags: ["quote", "clip-cue"] }
  ];

  return {
    blocks,
    views: createDefaultViews("offline-view"),
    projectId: OFFLINE_PROJECT_ID,
    projectSlug: config.slug,
    projectName: `${config.name} / Offline Browser Lab`,
    documentId: OFFLINE_DOCUMENT_ID,
    documentTitle: config.documentTitle,
    persistenceMode: "offline" as const
  };
}

async function loadLatestManuscriptSeedBlocks(prisma: ReturnType<typeof getPrismaClient>) {
  try {
    const snapshot = await prisma.studioManuscriptSnapshot.findFirst({
      orderBy: { updatedAt: "desc" }
    });

    const draft = safeManuscriptDraft(snapshot?.draftJson);
    if (!snapshot || !draft) return null;

    const textBlocks = createManuscriptDraftPlainText(draft)
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (textBlocks.length === 0) return null;

    return {
      title: snapshot.title || draft.title || "Latest manuscript snapshot",
      blocks: textBlocks.map((text, index) => ({
        id: `snapshot-${snapshot.id}-${index}`,
        text,
        tags: [] as string[]
      }))
    };
  } catch (error) {
    console.warn("Could not seed Quipsly workbench from latest manuscript snapshot.", error);
    return null;
  }
}

async function ensureDevLabShowTags(
  prisma: ReturnType<typeof getPrismaClient>,
  project: any,
  document: any
) {
  if (project.slug !== DEV_PROJECT_SLUG || !document?.blocks?.length) return false;

  const showTagSlugs = ["voice-homer", "voice-charlie", "show-note", "clip-cue"];
  const hasShowSpan = document.blocks.some((block: any) =>
    block.taggedSpans?.some((span: any) => showTagSlugs.includes(span.tag.slug))
  );
  if (hasShowSpan) return false;

  for (const tagSeed of SEED_TAGS) {
    const dbCategory = studioDbCategoryForQuipslyCategory(tagSeed.category);
    await prisma.studioTag.upsert({
      where: { projectId_slug: { projectId: project.id, slug: tagSeed.slug } },
      update: { label: tagSeed.label, category: dbCategory },
      create: {
        projectId: project.id,
        slug: tagSeed.slug,
        label: tagSeed.label,
        // @ts-ignore
        category: dbCategory
      }
    });
  }

  const tagRows = await prisma.studioTag.findMany({
    where: { projectId: project.id, slug: { in: showTagSlugs } }
  });
  const tagsBySlug = new Map(tagRows.map((tag: any) => [tag.slug, tag]));
  const tagPlan = [
    { block: document.blocks[0], slugs: ["voice-homer"] },
    { block: document.blocks[1] ?? document.blocks[0], slugs: ["voice-charlie", "show-note"] },
    { block: document.blocks[2] ?? document.blocks[0], slugs: ["clip-cue"] }
  ];

  for (const item of tagPlan) {
    for (const slug of item.slugs) {
      const tag = tagsBySlug.get(slug);
      if (!tag || !item.block?.body) continue;
      await prisma.studioTaggedSpan.upsert({
        where: {
          blockId_tagId_startOffset_endOffset: {
            blockId: item.block.id,
            tagId: tag.id,
            startOffset: 0,
            endOffset: item.block.body.length
          }
        },
        update: { selectedText: item.block.body },
        create: {
          documentId: document.id,
          blockId: item.block.id,
          tagId: tag.id,
          startOffset: 0,
          endOffset: item.block.body.length,
          selectedText: item.block.body,
          documentStableId: document.stableId,
          documentTitleSnapshot: document.title,
          blockStableId: item.block.stableId
        }
      });
    }
  }

  return true;
}

export async function seedTonightPack(projectSlug = DEFAULT_PROJECT_SLUG) {
  const config = projectConfig(projectSlug);
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping database seed and using offline workbench state.", error);
    return { projectId: OFFLINE_PROJECT_ID, documentId: OFFLINE_DOCUMENT_ID };
  }
  
  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: TONIGHT_WORKSPACE_SLUG },
    update: {},
    create: { slug: TONIGHT_WORKSPACE_SLUG, name: "Tonight Pack Workspace" }
  });

  const project = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  }) ?? await prisma.studioProject.create({
    data: { workspaceId: workspace.id, slug: config.slug, name: config.name }
  });

  const document = await prisma.studioDocument.findUnique({
    where: { stableId: config.documentStableId },
  }) ?? await prisma.studioDocument.create({
    data: { projectId: project.id, stableId: config.documentStableId, title: config.documentTitle }
  });

  // Seed Tags
  for (const t of SEED_TAGS) {
    const dbCategory = studioDbCategoryForQuipslyCategory(t.category);
    await prisma.studioTag.upsert({
      where: { projectId_slug: { projectId: project.id, slug: t.slug } },
      update: {
        label: t.label,
        category: dbCategory
      },
      create: { 
        projectId: project.id, 
        slug: t.slug, 
        label: t.label, 
        // @ts-ignore - Prisma types might be stale since db push failed, so bypass strict enum checks if needed
        category: dbCategory
      }
    });
  }

  // Seed Views
  for (const v of DEFAULT_VIEW_DEFINITIONS) {
    try {
      await prisma.studioViewDefinition.upsert({
        where: { projectId_name: { projectId: project.id, name: v.name } },
        update: {
          type: v.type,
          filters: { tagSlugs: v.tagSlugs, excludeTagSlugs: v.excludeTagSlugs ?? [], includeCategories: v.includeCategories },
          displaySettings: { mode: v.displayMode, showContext: v.showContext, collapseUnmatched: v.collapseUnmatched }
        },
        create: {
          projectId: project.id,
          name: v.name,
          // @ts-ignore
          type: v.type,
          filters: { tagSlugs: v.tagSlugs, excludeTagSlugs: v.excludeTagSlugs ?? [], includeCategories: v.includeCategories },
          displaySettings: { mode: v.displayMode, showContext: v.showContext, collapseUnmatched: v.collapseUnmatched }
        }
      });
    } catch (e) {
      console.warn(`Failed to seed StudioViewDefinition (is the schema pushed?): ${v.name}`);
    }
  }

  const existingBlocks = await prisma.studioDocumentBlock.count({ where: { documentId: document.id } });
  if (existingBlocks === 0) {
    const latestSnapshotSeed = config.seedFromLatestSnapshot ? await loadLatestManuscriptSeedBlocks(prisma) : null;
    if (latestSnapshotSeed) {
      await prisma.studioDocument.update({
        where: { id: document.id },
        data: { title: latestSnapshotSeed.title }
      });
    }

    const blocksData = latestSnapshotSeed?.blocks ?? createStarterBlocks(config.slug);

    for (let i = 0; i < blocksData.length; i++) {
      const b = blocksData[i];
      const block = await prisma.studioDocumentBlock.create({
        data: {
          documentId: document.id,
          stableId: b.id,
          order: i,
          body: b.text
        }
      });

      for (const tSlug of b.tags) {
        const tag = await prisma.studioTag.findUnique({ where: { projectId_slug: { projectId: project.id, slug: tSlug } } });
        if (tag) {
          await prisma.studioTaggedSpan.create({
            data: {
              documentId: document.id,
              blockId: block.id,
              tagId: tag.id,
              startOffset: 0,
              endOffset: b.text.length,
              selectedText: b.text,
              documentStableId: document.stableId,
              documentTitleSnapshot: document.title,
              blockStableId: block.stableId
            }
          });
        }
      }
    }
  }

  return { projectId: project.id, documentId: document.id };
}

export async function loadWorkbenchState(projectSlug = DEFAULT_PROJECT_SLUG) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; loading offline Quipsly workbench state.", error);
    return createOfflineWorkbenchState(projectSlug);
  }
  
  // Try to load with viewDefinitions, fallback to without if schema not applied yet
  let project = null;
  try {
    project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug },
      include: {
        tags: true,
        viewDefinitions: true,
        documents: {
          include: {
            blocks: {
              include: {
                taggedSpans: {
                  include: { tag: true }
                }
              },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn("Falling back to query without viewDefinitions. Is schema pushed?");
    project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug },
      include: {
        tags: true,
        documents: {
          include: {
            blocks: {
              include: {
                taggedSpans: {
                  include: { tag: true }
                }
              },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });
  }

  if (!project) return null;

  // Format into our UI shape
  const document = project.documents[0];
  if (!document) return null;

  if (await ensureDevLabShowTags(prisma, project, document)) {
    return loadWorkbenchState(projectSlug);
  }

  const blocks = document.blocks.map(b => ({
    id: b.id, // Use actual DB UUID
    text: b.body,
    tags: Array.from(new Set(b.taggedSpans.map(ts => ts.tag.slug))),
    spans: b.taggedSpans.map(ts => ({
      id: ts.id,
      tagSlug: ts.tag.slug,
      label: ts.tag.label,
      category: quipslyCategoryForTag(ts.tag),
      startOffset: ts.startOffset,
      endOffset: ts.endOffset,
      selectedText: ts.selectedText
    }))
  }));

  const views = (project.viewDefinitions || []).map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    filters: v.filters as any,
    display: v.displaySettings as any
  })) as ViewDefinition[];
  const effectiveViews = views.length > 0 ? views : createDefaultViews("fallback-view");

  return {
    blocks,
    views: effectiveViews,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    documentId: document.id,
    documentTitle: document.title,
    persistenceMode: "database" as const
  };
}

export async function saveBlockContent(blockId: string, newText: string) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline saveBlockContent.", error);
    return;
  }

  if (blockId.startsWith("offline-")) return;

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: { body: newText }
  });
  revalidatePath('/');
  revalidatePath('/create');
}

export async function splitBlockAtOffset(
  blockId: string,
  offset: number,
  endOffset?: number
) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline splitBlockAtOffset.", error);
    return null;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return null;

  const block = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    include: {
      document: true,
      taggedSpans: {
        include: { tag: true }
      }
    }
  });
  if (!block) return null;

  const splitStart = Math.max(0, Math.min(offset, block.body.length));
  const splitEnd = Math.max(splitStart, Math.min(endOffset ?? offset, block.body.length));
  const before = block.body.slice(0, splitStart);
  const after = block.body.slice(splitEnd);
  const followingBlocks = await prisma.studioDocumentBlock.findMany({
    where: {
      documentId: block.documentId,
      order: { gt: block.order }
    },
    orderBy: { order: "desc" },
    select: { id: true, order: true }
  });

  const result = await prisma.$transaction(async (tx) => {
    for (const following of followingBlocks) {
      await tx.studioDocumentBlock.update({
        where: { id: following.id },
        data: { order: following.order + 1 }
      });
    }

    await tx.studioDocumentBlock.update({
      where: { id: block.id },
      data: { body: before }
    });

    const newBlock = await tx.studioDocumentBlock.create({
      data: {
        documentId: block.documentId,
        stableId: `${block.stableId}-split-${Date.now()}`,
        order: block.order + 1,
        body: after,
        sourceLabel: block.sourceLabel,
        sourcePath: block.sourcePath,
        projectionStatus: block.projectionStatus,
        isPrivate: block.isPrivate
      }
    });

    for (const span of block.taggedSpans) {
      if (span.endOffset <= splitStart) {
        await tx.studioTaggedSpan.update({
          where: { id: span.id },
          data: {
            selectedText: before.slice(span.startOffset, span.endOffset)
          }
        });
        continue;
      }

      if (span.startOffset >= splitEnd) {
        const nextStart = span.startOffset - splitEnd;
        const nextEnd = span.endOffset - splitEnd;
        await tx.studioTaggedSpan.update({
          where: { id: span.id },
          data: {
            blockId: newBlock.id,
            startOffset: nextStart,
            endOffset: nextEnd,
            selectedText: after.slice(nextStart, nextEnd),
            blockStableId: newBlock.stableId,
            blockTitleSnapshot: newBlock.title
          }
        });
        continue;
      }

      const beforeStart = span.startOffset;
      const beforeEnd = Math.min(span.endOffset, splitStart);
      const afterStart = Math.max(0, span.startOffset - splitEnd);
      const afterEnd = Math.max(0, span.endOffset - splitEnd);

      if (beforeEnd > beforeStart) {
        await tx.studioTaggedSpan.update({
          where: { id: span.id },
          data: {
            startOffset: beforeStart,
            endOffset: beforeEnd,
            selectedText: before.slice(beforeStart, beforeEnd)
          }
        });
      } else {
        await tx.studioTaggedSpan.delete({ where: { id: span.id } });
      }

      if (afterEnd > afterStart) {
        await tx.studioTaggedSpan.create({
          data: {
            documentId: block.documentId,
            blockId: newBlock.id,
            tagId: span.tagId,
            startOffset: afterStart,
            endOffset: afterEnd,
            selectedText: after.slice(afterStart, afterEnd),
            documentStableId: block.document.stableId,
            documentTitleSnapshot: block.document.title,
            blockStableId: newBlock.stableId,
            blockTitleSnapshot: newBlock.title,
            sourceLabel: span.sourceLabel,
            sourcePath: span.sourcePath,
            sourceExternalId: span.sourceExternalId,
            projectionStatus: span.projectionStatus,
            isPrivate: span.isPrivate,
            createdByLabel: span.createdByLabel
          }
        });
      }
    }

    const tags = await tx.studioTaggedSpan.findMany({
      where: { blockId: newBlock.id },
      include: { tag: true }
    });

    return {
      currentBlock: {
        id: block.id,
        text: before,
        tags: block.taggedSpans
          .filter((span) => span.startOffset < splitStart)
          .map((span) => span.tag.slug)
      },
      newBlock: {
        id: newBlock.id,
        text: after,
        tags: tags.map((span) => span.tag.slug)
      }
    };
  });

  revalidatePath('/');
  revalidatePath('/create');
  return result;
}

export async function toggleBlockTag(
  blockId: string,
  documentId: string,
  projectId: string,
  tagSlug: string,
  text: string,
  selection?: { startOffset: number; endOffset: number; selectedText: string }
) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline toggleBlockTag.", error);
    return;
  }

  if (
    projectId === OFFLINE_PROJECT_ID ||
    documentId === OFFLINE_DOCUMENT_ID ||
    blockId.startsWith("offline-")
  ) {
    return;
  }
  
  // Find the tag
  let tag = await prisma.studioTag.findUnique({
    where: { projectId_slug: { projectId, slug: tagSlug } }
  });

  // Fallback creation just in case
  if (!tag) {
    tag = await prisma.studioTag.create({
      data: {
        projectId,
        slug: tagSlug,
        label: tagSlug,
        // @ts-ignore
        category: "meaning" 
      }
    });
  }

  const startOffset = selection?.startOffset ?? 0;
  const endOffset = selection?.endOffset ?? text.length;
  const selectedText = selection?.selectedText ?? text;

  const existingSpans = await prisma.studioTaggedSpan.findMany({
    where: {
      blockId,
      tagId: tag.id,
      startOffset,
      endOffset
    }
  });

  if (existingSpans.length > 0) {
    // Delete them
    for (const span of existingSpans) {
      await prisma.studioTaggedSpan.delete({ where: { id: span.id } });
    }
  } else {
    // Create span
    const doc = await prisma.studioDocument.findUnique({ where: { id: documentId } });
    const block = await prisma.studioDocumentBlock.findUnique({ where: { id: blockId } });
    
    await prisma.studioTaggedSpan.create({
      data: {
        documentId,
        blockId,
        tagId: tag.id,
        startOffset,
        endOffset,
        selectedText,
        documentStableId: doc!.stableId,
        documentTitleSnapshot: doc!.title,
        blockStableId: block!.stableId
      }
    });
  }
  
  revalidatePath('/');
  revalidatePath('/create');
}
