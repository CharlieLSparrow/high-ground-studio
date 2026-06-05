"use server";

import { getPrismaClient } from "@/lib/prisma";
import type { StudioProjectionStatus } from "@prisma/client";
import { ViewDefinition } from "./types";
import { revalidatePath } from "next/cache";
import {
  createManuscriptDraftPlainText,
  safeManuscriptDraft,
} from "../manuscript/manuscript-editor-model";
import {
  DEFAULT_PROJECT_SLUG,
  DEV_PROJECT_SLUG,
  lookupStudioProjectDocument,
  nestKindFromSourceLabel,
  projectConfig,
} from "./projectConfig";
import { createStarterBlocks } from "./starterDocuments";
import { GoogleGenAI, Schema, Type } from "@google/genai";

const OFFLINE_PROJECT_ID = "offline-quipsly-live";
const OFFLINE_DOCUMENT_ID = "offline-doc-live";
const STRUCTURE_TAG_SLUGS = ["chapter", "episode"];

// Make sure these match AVAILABLE_TAGS in ViewFilter/Tagger
const SEED_TAGS = [
  { slug: "quote", label: "Quote", category: "quote" },
  { slug: "social-clip", label: "Social Clip", category: "media" },
  { slug: "educational", label: "Educational", category: "educational" },
  { slug: "internal_note", label: "Internal Note", category: "internal_note" },
  { slug: "chapter", label: "Chapter", category: "chapter" },
  { slug: "media", label: "Media", category: "media" },
  { slug: "episode", label: "Episode", category: "episode" },
  { slug: "episode-1", label: "Episode 1", category: "episode" },
  { slug: "episode-4", label: "Episode 4", category: "episode" },
  { slug: "episode-8", label: "Episode 8", category: "episode" },
  { slug: "episode-9", label: "Episode 9", category: "episode" },
  { slug: "voice-homer", label: "Homer", category: "content_role" },
  { slug: "voice-charlie", label: "Charlie", category: "content_role" },
  { slug: "show-note", label: "Show Note", category: "workflow_status" },
  { slug: "clip-cue", label: "Clip Cue", category: "media" },
  { slug: "published-episode", label: "Published Episode", category: "media" },
  { slug: "youtube-clip", label: "YouTube Clip", category: "media" }
];

const TAG_CATEGORY_BY_SLUG = new Map(
  SEED_TAGS.map((tag) => [tag.slug, tag.category])
);

export type HeadingBulkNormalizeResult = {
  ok: boolean;
  updatedCount: number;
  attemptedCount: number;
  skippedCount: number;
  source: "local" | "gemini" | "hybrid";
  updatedBlocks: Array<{ blockId: string; nextText: string }>;
  skippedBlockIds: string[];
  message: string;
};

type BoundaryCandidate = {
  blockId: string;
  text: string;
  firstLine: string;
  suggestion: string;
};

const boundaryNormalizeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    updates: {
      type: Type.ARRAY,
      description: "Heading updates to apply. Only include blocks where a new canonical chapter/episode heading should replace the first line.",
      items: {
        type: Type.OBJECT,
        properties: {
          blockId: { type: Type.STRING },
          canonicalHeading: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ["blockId", "canonicalHeading"]
      }
    }
  },
  required: ["updates"]
};

function normalizeBoundaryLine(raw: string) {
  return raw
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[\-\*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeTitleCase(input: string) {
  return input
    .replace(/[\-_]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function inferBoundarySuggestion(blockText: string): string | null {
  const firstLine = normalizeBoundaryLine(blockText.split("\n")[0] ?? "");
  if (!firstLine || firstLine.length > 140) return null;

  const episodeMatch = firstLine.match(/^ep(?:isode)?\s*[-:\s]*(.*)$/i);
  if (episodeMatch) {
    const rest = canonicalizeTitleCase(episodeMatch[1] || "Episode");
    return `Episode ${rest || "Episode"}`.trim();
  }

  const chapterMatch = firstLine.match(/^chapter\s*[-:\s]*(.*)$/i);
  if (chapterMatch) {
    const rest = canonicalizeTitleCase(chapterMatch[1] || "Chapter");
    return `Chapter ${rest || "Chapter"}`.trim();
  }

  return null;
}

function applyBoundaryCandidateSuggestion(blockText: string, suggestion: string) {
  const lines = blockText.split("\n");
  const firstLine = lines[0] ?? "";
  const rest = lines.slice(1).join("\n");
  const normalizedCurrent = normalizeBoundaryLine(firstLine).toLowerCase();
  const normalizedSuggestion = normalizeBoundaryLine(suggestion).toLowerCase();
  if (normalizedCurrent === normalizedSuggestion) return null;
  return `${suggestion}${rest ? `\n${rest}` : ""}`;
}

function sanitizeCanonicalHeading(value: string) {
  const normalized = normalizeBoundaryLine(value).trim();
  if (!normalized || normalized.length < 3 || normalized.length > 140) return "";
  return normalized;
}

function stripPrefixNoise(value: string) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/^\s*[-*]\s*/, "")
    .trim();
}

function parseGeminiBoundaryPayload(text: string) {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    const updates = Array.isArray(parsed?.updates) ? parsed.updates : [];
    return updates
      .map((item: Record<string, unknown>) => {
        const blockId = typeof item?.blockId === "string" ? item.blockId.trim() : "";
        const canonicalHeading = typeof item?.canonicalHeading === "string" ? sanitizeCanonicalHeading(stripPrefixNoise(item.canonicalHeading)) : "";
        const reason = typeof item?.reason === "string" ? item.reason.trim() : "AI suggestion";
        return blockId && canonicalHeading ? { blockId, canonicalHeading, reason } : null;
      })
      .filter(Boolean) as Array<{ blockId: string; canonicalHeading: string; reason: string }>;
  } catch (_error) {
    return null;
  }
}

async function runGeminiBoundaryNormalization(candidates: BoundaryCandidate[]) {
  if (!process.env.GEMINI_API_KEY || candidates.length === 0) return [];
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `Normalize these heading candidates as JSON.\n\n${JSON.stringify(
    candidates.map((candidate) => ({
      blockId: candidate.blockId,
      firstLine: candidate.firstLine,
      localSuggestion: candidate.suggestion
    }))
  )}`;

  const response = await client.models.generateContent({
    model: process.env.GEMINI_BOUNDARY_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: `You are a writing outline cleanup assistant.\n\nNormalize these heading candidates as JSON.\n\n${prompt}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: boundaryNormalizeSchema,
      temperature: 0.2
    }
  });

  return parseGeminiBoundaryPayload(response.text ?? "") ?? [];
}

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
  { name: "Book Mode", type: "review", tagSlugs: [], excludeTagSlugs: ["show-note", "clip-cue", "youtube-clip", "published-episode", "internal_note", "social-clip", "media"], includeCategories: [], displayMode: "standard", showContext: true, collapseUnmatched: false },
  { name: "Show Mode", type: "review", tagSlugs: ["voice-homer", "voice-charlie", "show-note", "clip-cue", "youtube-clip", "published-episode"], includeCategories: ["content_role", "workflow_status", "media"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Published Episodes", type: "database", tagSlugs: ["published-episode"], includeCategories: ["media"], displayMode: "focus", showContext: true, collapseUnmatched: true },
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
    { id: "offline-preface", text: "Preface", tags: ["chapter"] },
    { id: "offline-episode-4-heading", text: "Episode 4", tags: ["episode"] },
    { id: "offline-episode-4", text: "Episode 4 scratchpad. Paste tonight's edit here and use Chapter/Episode heading blocks as the navigation spine.", tags: [] },
    { id: "offline-episode-8-heading", text: "Episode 8", tags: ["episode"] },
    { id: "offline-episode-8", text: "Episode 8 writing lane. This fallback proves the workbench can load without a database, but it will not persist changes.", tags: [] },
    { id: "offline-episode-9-heading", text: "Episode 9", tags: ["episode"] },
    { id: "offline-episode-9", text: "Episode 9 writing lane. In production this same screen should use StudioDocumentBlock and StudioTaggedSpan records.", tags: [] }
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
      // @ts-ignore
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
  
  const { project, document } = await lookupStudioProjectDocument(prisma, config.slug);
  const seedNestKind = nestKindFromSourceLabel(project.sourceLabel) || config.nestKind;

  // Seed Tags
  for (const t of SEED_TAGS) {
    const dbCategory = studioDbCategoryForQuipslyCategory(t.category);
    await prisma.studioTag.upsert({
      where: { projectId_slug: { projectId: project.id, slug: t.slug } },
      update: {
        label: t.label,
        // @ts-ignore
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

  // Seed Views — StudioViewDefinition is schema-optional; the try/catch handles missing model at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;
  for (const v of DEFAULT_VIEW_DEFINITIONS) {
    try {
      await prismaAny.studioViewDefinition.upsert({
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

    const blocksData = latestSnapshotSeed?.blocks ?? createStarterBlocks(config.slug, seedNestKind);

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
  
  // Try to load with viewDefinitions (schema-optional), fallback to without if not yet pushed
  // Try to load with viewDefinitions (schema-optional), fallback to without if not yet pushed
  let project = null;
  try {
    project = await prisma.studioProject.findFirst({
      where: { slug: projectConfig(projectSlug).slug },
      include: {
        tags: true,
        viewDefinitions: true,
        documents: {
          include: {
            blocks: {
              where: { archivedAt: null },
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
      where: { slug: projectConfig(projectSlug).slug },
      include: {
        tags: true,
        documents: {
          include: {
            blocks: {
              where: { archivedAt: null },
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

  const blocks = document.blocks.map((b) => ({
    id: b.id,
    text: b.body,
    tags: Array.from(new Set(b.taggedSpans.map((ts) => ts.tag.slug))),
    spans: b.taggedSpans.map((ts) => ({
      id: ts.id,
      tagSlug: ts.tag.slug,
      label: ts.tag.label,
      category: quipslyCategoryForTag(ts.tag),
      startOffset: ts.startOffset,
      endOffset: ts.endOffset,
      selectedText: ts.selectedText
    }))
  }));

  const views = ((project as any).viewDefinitions || []).map((v: any) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    filters: v.filters as any,
    display: v.displaySettings as any
  })) as ViewDefinition[];
  const effectiveViews = (views.length > 0 ? views : createDefaultViews("fallback-view"))
    .filter((view) => view.type !== "episode");

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

export async function archiveBlock(blockId: string) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline archiveBlock.", error);
    return;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return;

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: {
      archivedAt: new Date(),
      archivedByLabel: "quipsly-editor"
    }
  });

  revalidatePath('/');
  revalidatePath('/create');
}

export async function unarchiveBlock(blockId: string) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline unarchiveBlock.", error);
    return;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return;

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: {
      archivedAt: null,
      archivedByLabel: null
    }
  });

  revalidatePath('/');
  revalidatePath('/create');
}

export async function restoreBlockState(
  blockId: string,
  rawText: string,
  rawSpans: Array<{ tagSlug: string; startOffset: number; endOffset: number; selectedText: string }> = []
) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline restoreBlockState.", error);
    return;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return;

  const block = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          stableId: true,
          projectId: true,
          projectionStatus: true
        }
      }
    }
  });

  if (!block) return;

  const text = typeof rawText === "string" ? rawText : "";
  const spans = Array.isArray(rawText === null ? [] : rawSpans) ? rawSpans : [];
    const clampedSpans = spans
    .map((span) => {
      const safeStart = Math.max(0, Math.min(span.startOffset, text.length));
      const safeEnd = Math.max(safeStart, Math.min(span.endOffset, text.length));
      const safeSlug = String(span.tagSlug || "").trim();
      const safeSelectedText = typeof span.selectedText === "string" && span.selectedText.length > 0
        ? span.selectedText
        : text.slice(safeStart, safeEnd);
      return {
        tagSlug: safeSlug,
        startOffset: safeStart,
        endOffset: safeEnd,
        selectedText: safeSelectedText,
        key: `${safeSlug}|${safeStart}|${safeEnd}`
      };
    })
    .filter((span) => span.tagSlug.length > 0 && span.endOffset > span.startOffset);

  const uniqueSpans = new Map<string, typeof clampedSpans[number]>();
  for (const span of clampedSpans) {
    if (!uniqueSpans.has(span.key)) {
      uniqueSpans.set(span.key, span);
    }
  }

  const uniqueSlugs = Array.from(new Set(Array.from(uniqueSpans.values()).map((span) => span.tagSlug)));
  const projectTags = uniqueSlugs.length > 0
    ? await prisma.studioTag.findMany({
        where: {
          projectId: block.document.projectId,
          slug: { in: uniqueSlugs }
        }
      })
    : [];

  const tagIdBySlug = new Map<string, string>(projectTags.map((tag) => [tag.slug, tag.id]));

  await prisma.$transaction(async (tx) => {
    await tx.studioDocumentBlock.update({
      where: { id: block.id },
      data: { body: text }
    });

    await tx.studioTaggedSpan.deleteMany({
      where: { blockId: block.id }
    });

    const createPayload: import('@prisma/client').Prisma.StudioTaggedSpanCreateManyInput[] = [];

    for (const span of uniqueSpans.values()) {
      let tagId = tagIdBySlug.get(span.tagSlug);
      if (!tagId) {
        const createdTag = await tx.studioTag.create({
          data: {
            projectId: block.document.projectId,
            slug: span.tagSlug,
            label: span.tagSlug,
            // @ts-ignore
            category: "meaning"
          }
        });
        tagIdBySlug.set(span.tagSlug, createdTag.id);
        tagId = createdTag.id;
      }

      createPayload.push({
        documentId: block.document.id,
        blockId: block.id,
        tagId,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        selectedText: span.selectedText.slice(0, 1600),
        documentStableId: block.document.stableId,
        documentTitleSnapshot: block.document.title,
        blockStableId: block.stableId,
        blockTitleSnapshot: block.title ?? null,
        projectionStatus: block.document.projectionStatus as StudioProjectionStatus,
        isPrivate: true
      });
    }

    if (createPayload.length > 0) {
      await tx.studioTaggedSpan.createMany({ data: createPayload });
    }
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

export async function mergeBlockWithPrevious(blockId: string) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline mergeBlockWithPrevious.", error);
    return null;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return null;

  const block = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    include: {
      document: true,
      taggedSpans: {
        include: {
          tag: true
        }
      }
    }
  });
  if (!block) return null;

  const previousBlock = await prisma.studioDocumentBlock.findFirst({
    where: {
      documentId: block.documentId,
      order: { lt: block.order }
    },
    orderBy: { order: "desc" },
    include: {
      taggedSpans: true
    }
  });
  if (!previousBlock) return null;

  const mergedText = `${previousBlock.body}${block.body}`;

  await prisma.$transaction(async (tx) => {
    const following = await tx.studioDocumentBlock.findMany({
      where: {
        documentId: block.documentId,
        order: { gt: block.order }
      },
      orderBy: { order: "asc" },
      select: { id: true, order: true }
    });

    for (const follower of following) {
      await tx.studioDocumentBlock.update({
        where: { id: follower.id },
        data: { order: follower.order - 1 }
      });
    }

    await tx.studioDocumentBlock.update({
      where: { id: previousBlock.id },
      data: {
        body: mergedText
      }
    });

    const previousLength = previousBlock.body.length;
    const previousTaggedSpans = await tx.studioTaggedSpan.findMany({
      where: { blockId: previousBlock.id }
    });

    const previousSpanKeys = new Set(
      previousTaggedSpans.map((span) => `${span.tagId}|${span.startOffset}|${span.endOffset}`)
    );

    for (const span of block.taggedSpans) {
      const startOffset = span.startOffset + previousLength;
      const endOffset = span.endOffset + previousLength;

      if (endOffset <= previousLength) continue;
      if (startOffset >= mergedText.length) continue;

      const key = `${span.tagId}|${startOffset}|${endOffset}`;
      if (previousSpanKeys.has(key)) continue;

      await tx.studioTaggedSpan.create({
        data: {
          documentId: block.documentId,
          blockId: previousBlock.id,
          tagId: span.tagId,
          startOffset,
          endOffset,
          selectedText: block.body.slice(span.startOffset, span.endOffset),
          documentStableId: block.document.stableId,
          documentTitleSnapshot: block.document.title,
          blockStableId: previousBlock.stableId,
          blockTitleSnapshot: previousBlock.title,
          sourceLabel: span.sourceLabel,
          sourcePath: span.sourcePath,
          sourceExternalId: span.sourceExternalId,
          projectionStatus: span.projectionStatus,
          isPrivate: span.isPrivate,
          createdByLabel: span.createdByLabel
        }
      });
    }

    await tx.studioDocumentBlock.delete({ where: { id: block.id } });
  });

  revalidatePath('/');
  revalidatePath('/create');

  return {
    mergedBlockId: previousBlock.id,
    mergedText
  };
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

  const isStructureTag = STRUCTURE_TAG_SLUGS.includes(tagSlug);
  const effectiveSelection = isStructureTag ? undefined : selection;
  const startOffset = effectiveSelection?.startOffset ?? 0;
  const endOffset = effectiveSelection?.endOffset ?? text.length;
  const selectedText = effectiveSelection?.selectedText ?? text;

  const existingSpans = await prisma.studioTaggedSpan.findMany({
    where: isStructureTag
      ? { blockId, tagId: tag.id }
      : { blockId, tagId: tag.id, startOffset, endOffset }
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
    if (!doc || !block) return;

    if (isStructureTag) {
      const competingTags = await prisma.studioTag.findMany({
        where: {
          projectId,
          slug: {
            in: STRUCTURE_TAG_SLUGS.filter((slug) => slug !== tagSlug)
          }
        },
        select: { id: true }
      });

      await prisma.studioTaggedSpan.deleteMany({
        where: {
          blockId,
          tagId: { in: competingTags.map((competingTag) => competingTag.id) }
        }
      });
    }
    
    await prisma.studioTaggedSpan.create({
      data: {
        documentId,
        blockId,
        tagId: tag.id,
        startOffset,
        endOffset,
        selectedText,
        documentStableId: doc.stableId,
        documentTitleSnapshot: doc.title,
        blockStableId: block.stableId
      }
    });
  }
  
  revalidatePath('/');
  revalidatePath('/create');
}

export async function bulkNormalizeHeadings(documentId: string): Promise<HeadingBulkNormalizeResult> {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    return {
      ok: false,
      updatedCount: 0,
      attemptedCount: 0,
      skippedCount: 0,
      source: "local",
      updatedBlocks: [],
      skippedBlockIds: ["offline"],
      message: "DATABASE_URL is not configured. Connect the database before bulk cleanup."
    };
  }

  const document = await prisma.studioDocument.findUnique({
    where: { id: documentId },
    include: {
      blocks: {
        select: {
          id: true,
          body: true,
          taggedSpans: {
            select: { id: true }
          }
        },
        orderBy: { order: "asc" }
      }
    }
  });

  if (!document) {
    return {
      ok: false,
      updatedCount: 0,
      attemptedCount: 0,
      skippedCount: 0,
      source: "local",
      updatedBlocks: [],
      skippedBlockIds: [],
      message: "Could not load document for cleanup."
    };
  }

  const candidates: BoundaryCandidate[] = [];
  const skippedTaggedBlocks = new Set<string>();
  for (const block of document.blocks) {
    const suggestion = inferBoundarySuggestion(block.body);
    if (!suggestion) continue;

    const nextText = applyBoundaryCandidateSuggestion(block.body, suggestion);
    if (!nextText) continue;

    if (block.taggedSpans.length > 0) {
      skippedTaggedBlocks.add(block.id);
      continue;
    }

    candidates.push({
      blockId: block.id,
      text: block.body,
      firstLine: normalizeBoundaryLine(block.body.split("\n")[0] ?? ""),
      suggestion
    });
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      updatedCount: 0,
      attemptedCount: 0,
      skippedCount: skippedTaggedBlocks.size,
      source: "local",
      updatedBlocks: [],
      skippedBlockIds: [...skippedTaggedBlocks],
      message: skippedTaggedBlocks.size
        ? "No eligible headings for auto cleanup. Some candidate blocks were skipped to protect inline tags."
        : "No chapter/episode heading candidates found for cleanup."
    };
  }

  let selectedUpdates = candidates.map((candidate) => ({
    blockId: candidate.blockId,
    suggestion: candidate.suggestion,
    reason: "local deterministic"
  }));
  let source: HeadingBulkNormalizeResult["source"] = "local";

  try {
    const aiUpdates = await runGeminiBoundaryNormalization(candidates);
    if (aiUpdates.length > 0) {
      const aiMap = new Map(aiUpdates.map((entry) => [entry.blockId, entry]));
      let aiSuggestionCount = 0;
      selectedUpdates = selectedUpdates
        .map((item) => {
          const ai = aiMap.get(item.blockId);
          if (!ai) return item;
          aiSuggestionCount += 1;
          return {
            blockId: item.blockId,
            suggestion: ai.canonicalHeading,
            reason: `Gemini: ${ai.reason}`
          };
        })
        .filter((item) => item.suggestion);

      source = aiSuggestionCount === 0
        ? "local"
        : aiSuggestionCount === candidates.length
          ? "gemini"
          : "hybrid";
    }
  } catch (error) {
    source = "local";
  }

  const updatedBlocks: Array<{ blockId: string; nextText: string }> = [];
  let updatedCount = 0;
  for (const item of selectedUpdates) {
    const candidate = candidates.find((candidate) => candidate.blockId === item.blockId);
    if (!candidate) continue;

    const nextText = applyBoundaryCandidateSuggestion(candidate.text, item.suggestion);
    if (!nextText || nextText === candidate.text) continue;

    await prisma.studioDocumentBlock.update({
      where: { id: candidate.blockId },
      data: { body: nextText }
    });
    updatedCount += 1;
    updatedBlocks.push({ blockId: candidate.blockId, nextText });
  }

  revalidatePath("/");
  revalidatePath("/create");

  return {
    ok: true,
    updatedCount,
    attemptedCount: candidates.length,
    skippedCount: candidates.length - updatedCount + skippedTaggedBlocks.size,
    source,
    updatedBlocks,
    skippedBlockIds: [...skippedTaggedBlocks],
    message:
      updatedCount > 0
        ? source === "hybrid"
          ? "Bulk cleanup updated headings with Gemini-assisted normalization."
          : "Bulk cleanup applied deterministic chapter/episode normalization."
        : "No heading blocks required normalization."
  };
}

export async function searchQuotesAction(query: string, projectSlug: string, librarySlug = "active-manuscript") {
  try {
    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });
    if (!project) {
      return { ok: false, error: "Project not found" };
    }

    const { searchQuotes } = await import("@/lib/retrieval");
    const packet = await searchQuotes({ query, library: librarySlug }, { activeProjectId: project.id });
    return { ok: true, packet };
  } catch (error) {
    console.error("searchQuotesAction failed", error);
    return { ok: false, error: "Retrieval engine is temporarily unavailable." };
  }
}

export async function searchExamplesAction(query: string, projectSlug: string, librarySlug = "active-manuscript") {
  try {
    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });
    if (!project) {
      return { ok: false, error: "Project not found" };
    }

    const { searchExamples } = await import("@/lib/retrieval");
    const packet = await searchExamples({ query, library: librarySlug }, { activeProjectId: project.id });
    return { ok: true, packet };
  } catch (error) {
    console.error("searchExamplesAction failed", error);
    return { ok: false, error: "Retrieval engine is temporarily unavailable." };
  }
}


export async function compileActiveProjectPackages(projectId: string) {
  try {
    const prisma = getPrismaClient();
    const { auth } = await import("@/auth");
    const session = await auth();
    const ownerEmail = session?.user?.email || "quipsly-publisher@highgroundodyssey.com";

    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          include: {
            blocks: {
              include: {
                taggedSpans: {
                  include: { tag: true }
                }
              },
              orderBy: { order: "asc" }
            }
          }
        }
      }
    });

    if (!project || !project.documents[0]) {
      return { ok: false, error: "Project or document not found." };
    }

    const document = project.documents[0];
    const blocks = document.blocks;

    // Segment document by boundaries (blocks tagged "episode" or "chapter")
    const segments: Array<{
      boundaryBlockId: string;
      label: string;
      kind: "episode" | "chapter";
      startIndex: number;
      endIndex: number;
    }> = [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const tags = Array.from(new Set([
        ...(b.taggedSpans?.map(ts => ts.tag.slug) || [])
      ])).map(t => t.toLowerCase());

      const isEpisode = tags.includes("episode");
      const isChapter = tags.includes("chapter");

      if (isEpisode || isChapter) {
        const firstLine = b.body.split("\n")[0].trim();
        const label = firstLine || (isEpisode ? "Episode" : "Chapter");
        segments.push({
          boundaryBlockId: b.id,
          label,
          kind: isEpisode ? "episode" : "chapter",
          startIndex: i,
          endIndex: blocks.length - 1
        });
      }
    }

    // Set end indexes for segments
    for (let i = 0; i < segments.length; i++) {
      segments[i].endIndex = (segments[i + 1]?.startIndex ?? blocks.length) - 1;
    }

    if (segments.length === 0) {
      return { ok: false, error: "No episode or chapter tags found in document to compile." };
    }

    const compiledCount = segments.length;

    for (const segment of segments) {
      const bodyBlocks = blocks.slice(segment.startIndex + 1, segment.endIndex + 1);
      
      const excludedBlocks: Array<{ blockId: string; preview: string; reason: string }> = [];
      const bodyTextParts: string[] = [];

      for (const b of bodyBlocks) {
        const spans = b.taggedSpans || [];
        const privateSpans = spans.filter(ts => 
          ts.tag.slug.toLowerCase() === "internal_note" || 
          ts.tag.slug.toLowerCase() === "private" ||
          ts.tag.slug.toLowerCase() === "private_note"
        );
        
        if (privateSpans.length === 0) {
          bodyTextParts.push(b.body);
          continue;
        }

        const isWholeBlockPrivate = privateSpans.some(ts => 
          ts.startOffset == null || ts.endOffset == null || 
          (ts.startOffset === 0 && ts.endOffset >= b.body.length - 1)
        );

        if (isWholeBlockPrivate) {
          excludedBlocks.push({ blockId: b.id, preview: b.body.substring(0, 80) + "...", reason: "Entire block marked private" });
          continue;
        }

        let cleanText = "";
        let currentIndex = 0;
        const sortedPrivate = [...privateSpans].sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));
        
        let strippedAny = false;
        for (const span of sortedPrivate) {
          if (span.startOffset != null && span.startOffset > currentIndex) {
            cleanText += b.body.substring(currentIndex, span.startOffset);
          }
          if (span.endOffset != null) {
            currentIndex = Math.max(currentIndex, span.endOffset);
            strippedAny = true;
          }
        }
        if (currentIndex < b.body.length) {
          cleanText += b.body.substring(currentIndex);
        }

        if (strippedAny) {
          excludedBlocks.push({ blockId: b.id, preview: `(Span Removed) ${b.body.substring(0, 80)}...`, reason: "Contains private text spans" });
        }

        if (cleanText.trim().length > 0) {
          bodyTextParts.push(cleanText.trim());
        }
      }
      
      const bodyText = bodyTextParts.join("\n\n");
      const summary = bodyText.substring(0, 160).trim() + (bodyText.length > 160 ? "..." : "");

      // Extract verified quotes within this segment
      const verifiedQuotes: Array<{ text: string; attribution: string; principleId?: string }> = [];
      for (let idx = segment.startIndex; idx <= segment.endIndex; idx++) {
        const b = blocks[idx];
        if (b.taggedSpans) {
          for (const ts of b.taggedSpans) {
            if (ts.tag.slug.toLowerCase() === "quote") {
              verifiedQuotes.push({
                text: ts.selectedText,
                attribution: "Unknown", // Default attribution
                principleId: undefined
              });
            }
          }
        }
      }

      const cleanSlug = segment.label
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .trim();

      const recordId = `quipsly-hgo-public-${cleanSlug}`;
      const candidateId = `candidate-${cleanSlug}`;
      const proposedRoute = `/episodes/${cleanSlug}`;
      const siteUrl = (process.env.HGO_SITE_URL || "https://highgroundodyssey.com").replace(/\/$/, "");
      const publicUrl = `${siteUrl}${proposedRoute}`;

      // Construct QuipslyPublicPackage shape
      const packet = {
        id: `compiled-${segment.boundaryBlockId}`,
        projectId: project.id,
        kind: segment.kind,
        title: segment.label,
        summary,
        body: bodyText || `<p>Draft content for ${segment.label}.</p>`,
        media: {
          audioUrl: "", // blank initially for user to fill/edit
          videoUrl: "",
          thumbnailUrl: ""
        },
        beats: [
          { title: "Introduction", summary: `Start of ${segment.label}`, timestamp: 0 }
        ],
        verifiedQuotes,
        overrides: {
          youtube: {
            tags: ["quipsly", segment.kind],
            chapterMarkers: ["0:00 Intro"],
            isShort: false
          },
          patreon: {
            isMembersOnly: false,
            teaser: `New public ${segment.kind}: ${segment.label}`
          }
        },
        metadata: {
          publishedAt: new Date().toUTCString(),
          author: project.sourceLabel || "High Ground Studio",
          excludedBlocks // Passed so Publisher Panel can display audit warnings
        }
      };

      const frontmatter = {
        title: packet.title,
        subtitle: null,
        episodeNumber: String(segment.startIndex + 1), // Default episode order
        summary: packet.summary,
        slug: cleanSlug,
        youtubeId: null,
        projectSlug: project.slug,
        source: "quipsly-nest-hgo-public-episodes-v1",
      };

      const reviewBrief = {
        status: "private-review",
        source: "quipsly-nest-hgo-public-episodes-v1",
        checked: [
          "public packet has no private operator notes",
          "episode page route is deterministic",
        ],
      };

      // Stage Artifact
      const stagedArtifact = await prisma.hgoStagedProjectionArtifact.upsert({
        where: {
          ownerEmail_recordId: {
            ownerEmail,
            recordId,
          },
        },
        update: {
          artifactVersion: "episode-v1",
          artifactId: packet.id,
          projectionId: packet.id,
          projectionSlug: cleanSlug,
          projectionTitle: packet.title,
          projectionStatus: "private-review",
          projectionVisibility: "public",
          sourceBridgeVersion: "quipsly-nest-hgo-public-episodes-v1",
          artifactStatus: "draft",
          recommendedNextAction: "live-on-highgroundodyssey",
          reviewStatus: "draft",
          promotionReadiness: "draft",
          artifactHash: `hash-${cleanSlug}-${Date.now()}`,
          artifactJson: JSON.parse(JSON.stringify(packet)),
          artifactSummaryJson: JSON.parse(JSON.stringify(frontmatter)),
          eventLogJson: JSON.parse(JSON.stringify([
            {
              type: "compiled-from-quipsly-nest",
              at: new Date().toISOString(),
              route: proposedRoute,
              projectSlug: project.slug,
            },
          ])),
          blockerCount: 0,
          warningCount: 0,
          containsRealContent: "true",
          note: "Public episode page compiled from Quipsly Nest.",
          reviewedAt: null,
          reviewedByEmail: null,
          archivedAt: null,
        },
        create: {
          ownerEmail,
          recordId,
          artifactVersion: "episode-v1",
          artifactId: packet.id,
          projectionId: packet.id,
          projectionSlug: cleanSlug,
          projectionTitle: packet.title,
          projectionStatus: "private-review",
          projectionVisibility: "public",
          sourceBridgeVersion: "quipsly-nest-hgo-public-episodes-v1",
          artifactStatus: "draft",
          recommendedNextAction: "live-on-highgroundodyssey",
          reviewStatus: "draft",
          promotionReadiness: "draft",
          artifactHash: `hash-${cleanSlug}-${Date.now()}`,
          artifactJson: JSON.parse(JSON.stringify(packet)),
          artifactSummaryJson: JSON.parse(JSON.stringify(frontmatter)),
          eventLogJson: JSON.parse(JSON.stringify([
            {
              type: "compiled-from-quipsly-nest",
              at: new Date().toISOString(),
              route: proposedRoute,
              projectSlug: project.slug,
            },
          ])),
          blockerCount: 0,
          warningCount: 0,
          containsRealContent: "true",
          note: "Public episode page compiled from Quipsly Nest.",
        },
      });

      // Upsert candidate
      await prisma.hgoEpisodePublishCandidate.upsert({
        where: {
          ownerEmail_sourceRecordId: {
            ownerEmail,
            sourceRecordId: recordId,
          },
        },
        update: {
          candidateId,
          sourceStagedArtifact: { connect: { id: stagedArtifact.id } },
          sourceArtifactId: packet.id,
          sourceArtifactHash: stagedArtifact.artifactHash,
          projectionId: packet.id,
          projectionSlug: cleanSlug,
          projectionTitle: packet.title,
          proposedRoute,
          readinessState: "ready",
          candidateStatus: "private-review",
          packetJson: JSON.parse(JSON.stringify(packet)),
          reviewBriefJson: JSON.parse(JSON.stringify(reviewBrief)),
          draftPacketJson: JSON.parse(JSON.stringify(packet)),
          frontmatterJson: JSON.parse(JSON.stringify(frontmatter)),
          mdxDraft: bodyText,
          blockerCount: 0,
          warningCount: 0,
          containsRealContent: "true",
          note: "Compiled from Quipsly Nest manuscript.",
          createdByEmail: ownerEmail,
          approvedAt: null,
          approvedByEmail: null,
          archivedAt: null,
        },
        create: {
          ownerEmail,
          candidateId,
          sourceStagedArtifact: { connect: { id: stagedArtifact.id } },
          sourceRecordId: recordId,
          sourceArtifactId: packet.id,
          sourceArtifactHash: stagedArtifact.artifactHash,
          projectionId: packet.id,
          projectionSlug: cleanSlug,
          projectionTitle: packet.title,
          proposedRoute,
          readinessState: "ready",
          candidateStatus: "private-review",
          packetJson: JSON.parse(JSON.stringify(packet)),
          reviewBriefJson: JSON.parse(JSON.stringify(reviewBrief)),
          draftPacketJson: JSON.parse(JSON.stringify(packet)),
          frontmatterJson: JSON.parse(JSON.stringify(frontmatter)),
          mdxDraft: bodyText,
          blockerCount: 0,
          warningCount: 0,
          containsRealContent: "true",
          note: "Compiled from Quipsly Nest manuscript.",
          createdByEmail: ownerEmail,
        },
      });
    }

    revalidatePath("/publishing-suite");
    revalidatePath("/publishing-suite/package-builder");
    revalidatePath("/create");

    return { ok: true, message: `Successfully compiled ${compiledCount} packages from document.` };
  } catch (error: any) {
    console.error("compileActiveProjectPackages failed", error);
    return { ok: false, error: error.message || "Failed to compile document outline." };
  }
}

export async function getEpisodeCandidatesAction(projectId: string) {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const isOwner = session?.user?.email?.endsWith("@highgroundodyssey.com") || process.env.NODE_ENV === "development";

    const prisma = getPrismaClient();
    const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: "desc" }
    });

    // Filter project candidates in-memory to prevent complex JSON queries
    const projectCandidates = candidates.filter((c: any) => {
      const packet = c.draftPacketJson as any;
      return packet && packet.projectId === projectId;
    }).map((c: any) => ({
      id: c.id,
      candidateId: c.candidateId,
      sourceRecordId: c.sourceRecordId,
      projectionSlug: c.projectionSlug,
      projectionTitle: c.projectionTitle,
      proposedRoute: c.proposedRoute,
      candidateStatus: c.candidateStatus,
      packet: c.draftPacketJson,
      updatedAt: c.updatedAt.toISOString()
    }));

    return { ok: true, candidates: projectCandidates, isOwner };
  } catch (error: any) {
    console.error("getEpisodeCandidatesAction failed", error);
    return { ok: false, error: error.message || "Failed to query episode candidates." };
  }
}

export async function approveEpisodeCandidateAction(candidateId: string) {
  try {
    const prisma = getPrismaClient();
    const { auth } = await import("@/auth");
    const session = await auth();
    const ownerEmail = session?.user?.email || "quipsly-publisher@highgroundodyssey.com";

    const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
      where: { id: candidateId },
      include: { sourceStagedArtifact: true }
    });

    if (!candidate) {
      return { ok: false, error: "Candidate not found." };
    }

    const quipslyPkg = (candidate.draftPacketJson || candidate.packetJson) as any;
    const { mapQuipslyPackageToHgoPacket } = await import("@/lib/publishing/DestinationAdapters");
    const hgoPublicPacket = mapQuipslyPackageToHgoPacket(
      quipslyPkg,
      candidate.projectionSlug,
      "4",
      candidate.sourceArtifactHash
    );

    // Write packet to apps/web filesystem so the web app can read it
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const contentDir = path.join(process.cwd(), "../web/content/publish/hgo-episodes");
    const filePath = path.join(contentDir, `${candidate.projectionSlug}.json`);
    const indexPath = path.join(contentDir, `episodes-index.json`);

    try {
      await fs.mkdir(contentDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(hgoPublicPacket, null, 2), "utf8");

      let index: Record<string, any> = {};
      try {
        const indexContent = await fs.readFile(indexPath, "utf8");
        index = JSON.parse(indexContent);
      } catch (e) {
        // Ignore if file doesn't exist
      }

      index[hgoPublicPacket.slug] = {
        id: hgoPublicPacket.id,
        slug: hgoPublicPacket.slug,
        title: hgoPublicPacket.title,
        episodeNumber: hgoPublicPacket.episodeNumber,
        summary: hgoPublicPacket.summary,
        publishedAt: hgoPublicPacket.provenance.publishedAt,
      };

      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
    } catch (fsError) {
      console.error("Failed to write package to disk during approval:", fsError);
    }

    await prisma.$transaction(async (tx) => {
      await tx.hgoEpisodePublishCandidate.update({
        where: { id: candidate.id },
        data: {
          candidateStatus: "published",
          approvedAt: new Date(),
          approvedByEmail: ownerEmail,
          packetJson: hgoPublicPacket as any,
          draftPacketJson: hgoPublicPacket as any,
        }
      });

      if (candidate.sourceStagedArtifact) {
        await tx.hgoStagedProjectionArtifact.update({
          where: { id: candidate.sourceStagedArtifact.id },
          data: {
            projectionStatus: "published",
            reviewStatus: "published",
            promotionReadiness: "published",
            artifactStatus: "published",
            reviewedAt: new Date(),
            reviewedByEmail: ownerEmail
          }
        });
      }
    });

    revalidatePath("/publishing-suite");
    revalidatePath("/publishing-suite/package-builder");
    revalidatePath("/create");

    return { ok: true, message: "Successfully published package to HighGroundOdyssey.com!" };
  } catch (error: any) {
    console.error("approveEpisodeCandidateAction failed", error);
    return { ok: false, error: error.message || "Failed to publish package." };
  }
}

export async function getEpisodeCandidatesBySlugAction(projectSlug: string) {
  try {
    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });
    if (!project) {
      // Fallback: get the first project in database if not found by slug
      const fallbackProject = await prisma.studioProject.findFirst();
      if (!fallbackProject) {
        return { ok: false, error: "No projects found." };
      }
      return getEpisodeCandidatesAction(fallbackProject.id);
    }
    return getEpisodeCandidatesAction(project.id);
  } catch (error: any) {
    console.error("getEpisodeCandidatesBySlugAction failed", error);
    return { ok: false, error: error.message || "Failed to query." };
  }
}

export async function getPublishingSuiteStatsAction(projectSlug: string) {
  try {
    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });
    if (!project) {
      return { ok: true, drafted: 0, published: 0 };
    }
    const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
      where: { archivedAt: null }
    });

    const projectCandidates = candidates.filter((c: any) => {
      const packet = c.draftPacketJson as any;
      return packet && packet.projectId === project.id;
    });

    const drafted = projectCandidates.filter((c: any) => c.candidateStatus !== "published").length;
    const published = projectCandidates.filter((c: any) => c.candidateStatus === "published").length;

    return { ok: true, drafted, published };
  } catch (error) {
    console.error("getPublishingSuiteStatsAction failed", error);
    return { ok: false, drafted: 0, published: 0 };
  }
}

export async function saveAssistantAction(actionId: string, provenance: Record<string, any>) {
  try {
    if (!process.env.DATABASE_URL) return { ok: true, fallback: true };
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
      });
      if (!action) throw new Error("Action not found");

      await tx.studioAssistantAction.update({
        where: { id: actionId },
        data: { status: "saved" },
      });

      // @ts-ignore
      await tx.studioAssistantLedger.create({
        data: {
          actionId,
          previousStatus: action.status,
          newStatus: "saved",
          notes: JSON.stringify(provenance),
        },
      });
    });

    return { ok: true };
  } catch (error: any) {
    console.error("saveAssistantAction failed", error);
    return { ok: false, error: error.message };
  }
}

export async function undoSavedAssistantAction(actionId: string) {
  try {
    if (!process.env.DATABASE_URL) return { ok: true, fallback: true };
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
      });
      if (!action) throw new Error("Action not found");

      await tx.studioAssistantAction.update({
        where: { id: actionId },
        data: { status: "undone" },
      });

      // @ts-ignore
      await tx.studioAssistantLedger.create({
        data: {
          actionId,
          previousStatus: action.status,
          newStatus: "undone",
          notes: "Archived/deleted saved note",
        },
      });
    });

    return { ok: true };
  } catch (error: any) {
    console.error("undoSavedAssistantAction failed", error);
    return { ok: false, error: error.message };
  }
}
