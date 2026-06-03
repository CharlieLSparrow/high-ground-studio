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
import { GoogleGenAI, Schema, Type } from "@google/genai";

export type CreateEpisodeResult = {
  ok: boolean;
  error?: string;
  view?: ViewDefinition;
};

const EPISODE_VIEW_DEFINITION = {
  type: "episode" as const,
  displayMode: "focus" as const,
  showContext: true,
  collapseUnmatched: true,
  includeCategories: ["episode", "chapter", "structure"] as const
};

function slugifyEpisodeLabel(label: string) {
  const normalized = label.trim().replace(/^episode\s+/i, "").replace(/\s+view$/i, "").trim();
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return { normalized, slug };
}

function displayCaseEpisodeLabel(normalized: string) {
  return normalized
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(?:^|\s)([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

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
  { name: "Episode 1 View", type: "episode", tagSlugs: ["episode-1"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Episode 4 View", type: "episode", tagSlugs: ["episode-4"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Episode 8 View", type: "episode", tagSlugs: ["episode-8"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
  { name: "Episode 9 View", type: "episode", tagSlugs: ["episode-9"], includeCategories: ["episode", "chapter", "structure"], displayMode: "focus", showContext: true, collapseUnmatched: true },
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

    const createPayload: {
      documentId: string;
      blockId: string;
      tagId: string;
      startOffset: number;
      endOffset: number;
      selectedText: string;
      documentStableId: string;
      documentTitleSnapshot: string;
      blockStableId: string;
      blockTitleSnapshot: string | null;
      projectionStatus: string;
      isPrivate: boolean;
    }[] = [];

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
        projectionStatus: block.document.projectionStatus,
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

export async function createEpisodeView(
  projectId: string,
  episodeLabelInput: string
): Promise<CreateEpisodeResult> {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    return { ok: false, error: "DATABASE_URL is not set." };
  }

  if (projectId === OFFLINE_PROJECT_ID) {
    return { ok: false, error: "Offline mode does not support creating new episodes." };
  }

  const { normalized, slug } = slugifyEpisodeLabel(episodeLabelInput);
  if (!slug) {
    return { ok: false, error: "Episode name cannot be empty." };
  }

  const project = await prisma.studioProject.findUnique({
    where: { id: projectId },
    select: { id: true }
  });
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  const episodeTagSlug = `episode-${slug}`;
  const tagLabel = displayCaseEpisodeLabel(normalized);
  const viewName = `Episode ${tagLabel} View`;
  const normalizedTagLabel = tagLabel.length > 0 ? tagLabel : "Untitled";

  await prisma.studioTag.upsert({
    where: { projectId_slug: { projectId, slug: episodeTagSlug } },
    update: { label: normalizedTagLabel, category: "structure" },
    create: {
      projectId,
      slug: episodeTagSlug,
      label: normalizedTagLabel,
      // @ts-ignore
      category: "structure"
    }
  });

  const view = await prisma.studioViewDefinition.upsert({
    where: { projectId_name: { projectId, name: viewName } },
    update: {
      // @ts-ignore
      type: EPISODE_VIEW_DEFINITION.type,
      filters: {
        tagSlugs: [episodeTagSlug],
        excludeTagSlugs: [],
        includeCategories: [...EPISODE_VIEW_DEFINITION.includeCategories]
      },
      displaySettings: {
        mode: EPISODE_VIEW_DEFINITION.displayMode,
        showContext: EPISODE_VIEW_DEFINITION.showContext,
        collapseUnmatched: EPISODE_VIEW_DEFINITION.collapseUnmatched
      }
    },
    create: {
      projectId,
      name: viewName,
      // @ts-ignore
      type: EPISODE_VIEW_DEFINITION.type,
      filters: {
        tagSlugs: [episodeTagSlug],
        excludeTagSlugs: [],
        includeCategories: [...EPISODE_VIEW_DEFINITION.includeCategories]
      },
      displaySettings: {
        mode: EPISODE_VIEW_DEFINITION.displayMode,
        showContext: EPISODE_VIEW_DEFINITION.showContext,
        collapseUnmatched: EPISODE_VIEW_DEFINITION.collapseUnmatched
      }
    }
  });

  revalidatePath("/create");

  return {
    ok: true,
    view: {
      id: view.id,
      name: view.name,
      type: view.type,
      filters: view.filters as ViewDefinition["filters"],
      display: view.displaySettings as ViewDefinition["display"]
    }
  };
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
