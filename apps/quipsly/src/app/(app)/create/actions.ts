"use server";

import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { syncBlocksToQuipslyNote } from "@/lib/server/bi-directional-sync";
import {
  QUIPSLY_EMBEDDING_MODEL,
  syncProjectEmbeddings,
} from "@/lib/retrieval/embeddings";
import {
  LEGACY_PUBLISHING_EXECUTION_ERROR,
  LEGACY_PUBLISHING_EXECUTION_RETIRED,
} from "@/lib/server/retired-publishing-execution";
import {
  canAccessStudioProjectBySlug,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";
import type {
  Prisma,
  StoryEntityType,
  StudioProjectionStatus,
  StudioTagCategory,
} from "@prisma/client";
import { ViewDefinition } from "./types";
import type {
  WorkbenchBaseState,
  WorkbenchScopeProjectSummary,
  WorkbenchScopedState,
} from "./types";
import {
  createAndAssignWorkEntityTag,
  normalizeWorkTagLabel,
  replaceWorkEntityTags,
  resolveReusableProjectTag,
} from "@/lib/server/work-tags";
import { revalidatePath } from "next/cache";
import {
  createManuscriptDraftPlainText,
  safeManuscriptDraft,
} from "../manuscript/manuscript-editor-model";
import {
  DEFAULT_PROJECT_SLUG,
  DEV_PROJECT_SLUG,
  lookupStudioProjectDocument,
  normalizeProjectSlug,
  ensureStudioWorkspace,
  nestKindFromSourceLabel,
  workflowSystemForNestKind,
  projectConfig,
} from "./projectConfig";
import { createStarterBlocks } from "./starterDocuments";
import { GoogleGenAI, Schema, Type } from "@google/genai";
import {
  DOCUMENT_EXPORT_SCHEMA_VERSION,
  documentSha256,
  stableDocumentJson,
  validateDocumentBundle,
  type PortableDocumentBundle,
  type PortableDocumentSnapshot,
} from "@/lib/document-portability";
import {
  assertMutableWritingBlock,
  isImmutableTranscriptSourceExternalId,
} from "@/lib/studio/immutable-source";

const UNAVAILABLE_PROJECT_ID = "unavailable-quipsly";
const UNAVAILABLE_DOCUMENT_ID = "unavailable-document";
const STRUCTURE_TAG_SLUGS = ["chapter", "episode"];

export type DocumentTagActionResult =
  | {
      ok: true;
      documentId: string;
      projectId: string;
      tagIds: string[];
      updatedAt: string;
      tagRevision: number;
      receiptId: string;
      idempotentReplay: boolean;
    }
  | {
      ok: false;
      code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      error: string;
    };

export type CreateDocumentTagActionResult =
  | {
      ok: true;
      documentId: string;
      projectId: string;
      tag: { id: string; label: string; slug: string; category: string; projectId: string };
      created: boolean;
      assignmentChanged: boolean;
      updatedAt: string;
      tagRevision: number;
      receiptId: string;
    }
  | {
      ok: false;
      code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ARCHIVED" | "UNAVAILABLE";
      error: string;
    };

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

type ScopeProjectSlugsInput = string | string[] | undefined;

type RawLinkedProjectRequest = {
  projectSlug: string;
  projectName: string;
};

type ScopedProjectSelection = {
  projectSlug: string;
  projectName: string;
};

const MAX_LINKED_SCOPE_COUNT = 8;

function normalizeScopeSlugs(input: ScopeProjectSlugsInput, primaryProjectSlug: string) {
  if (!input) return [] as string[];

  const rawValues = Array.isArray(input)
    ? input.flatMap((raw) => String(raw).split(","))
    : String(input).split(",");

  const normalized = rawValues
    .map((value) => normalizeProjectSlug(value))
    .filter((slug) => slug.length > 0 && slug !== primaryProjectSlug);

  return Array.from(new Set(normalized)).slice(0, MAX_LINKED_SCOPE_COUNT);
}

function buildUnavailableScopeSummary(slug: string, status: WorkbenchScopeProjectSummary["status"], reason?: string): WorkbenchScopeProjectSummary {
  return {
    projectId: "",
    projectSlug: slug,
    projectName: slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    projectNestKind: "writing",
    workflowSystem: "content-creation",
    status,
    persistenceMode: "unavailable",
    reason,
  };
}

function projectToScopeSummary(
  project: any,
  scopeConfig: ScopedProjectSelection,
): WorkbenchScopeProjectSummary | null {
  const latestDocument = project?.documents?.[0];
  const projectNestKind = nestKindFromSourceLabel(project?.sourceLabel ?? null);
  const workflowSystem = workflowSystemForNestKind(projectNestKind);
  if (!latestDocument?.id) {
    return {
      projectId: project?.id ?? "",
      projectSlug: scopeConfig.projectSlug,
      projectName: scopeConfig.projectName,
      projectNestKind,
      workflowSystem,
      status: "missing",
      persistenceMode: "database",
      reason: "No document available for this Nest."
    };
  }

  return {
    projectId: project.id,
    projectSlug: scopeConfig.projectSlug,
    projectName: scopeConfig.projectName,
    projectNestKind,
    workflowSystem,
    status: "connected",
    documentId: latestDocument.id,
    documentTitle: latestDocument.title,
    persistenceMode: "database"
  };
}

const TAG_CATEGORY_BY_SLUG = new Map(
  SEED_TAGS.map((tag) => [tag.slug, tag.category])
);

async function getActorEmail() {
  const session = await auth();
  return session?.user?.primaryEmail || session?.user?.email || null;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function recordDocumentOperation(
  prisma: ReturnType<typeof getPrismaClient>,
  input: {
    projectId: string;
    documentId: string;
    operationType: string;
    beforeJson?: unknown;
    afterJson?: unknown;
    payloadJson?: unknown;
    groupId?: string;
    origin?: "human" | "assistant" | "system" | "import";
  },
) {
  try {
    const actorEmail = await getActorEmail();
    await prisma.studioDocumentOperation.create({
      data: {
        projectId: input.projectId,
        documentId: input.documentId,
        groupId: input.groupId ?? null,
        actorEmail,
        origin: input.origin ?? "human",
        operationType: input.operationType,
        beforeJson: input.beforeJson === undefined ? undefined : toPrismaJson(input.beforeJson),
        afterJson: input.afterJson === undefined ? undefined : toPrismaJson(input.afterJson),
        payloadJson: toPrismaJson(input.payloadJson),
        reversible: true,
      },
    });
  } catch (error) {
    console.warn("Could not record document operation.", error);
  }
}

async function requireProjectAccessBySlug(
  prisma: ReturnType<typeof getPrismaClient>,
  projectSlug: string,
  action: StudioProjectAccessAction,
) {
  const actorEmail = await getActorEmail();
  const allowed = await canAccessStudioProjectBySlug({
    projectSlug,
    email: actorEmail,
    action,
    prisma,
  });

  if (!allowed) {
    throw new Error(`You do not have ${action} access to this Nest.`);
  }
}

async function requireProjectAccessByProjectId(
  prisma: ReturnType<typeof getPrismaClient>,
  projectId: string,
  action: StudioProjectAccessAction,
) {
  const project = await prisma.studioProject.findUnique({
    where: { id: projectId },
    select: { slug: true },
  });

  if (!project) {
    throw new Error("Nest not found.");
  }

  await requireProjectAccessBySlug(prisma, project.slug, action);
}

async function requireProjectAccessByDocumentId(
  prisma: ReturnType<typeof getPrismaClient>,
  documentId: string,
  action: StudioProjectAccessAction,
) {
  const document = await prisma.studioDocument.findUnique({
    where: { id: documentId },
    select: { project: { select: { slug: true } } },
  });

  if (!document) {
    throw new Error("Document not found.");
  }

  await requireProjectAccessBySlug(prisma, document.project.slug, action);
}

async function requireProjectAccessByBlockId(
  prisma: ReturnType<typeof getPrismaClient>,
  blockId: string,
  action: StudioProjectAccessAction,
) {
  const block = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    select: { document: { select: { project: { select: { slug: true } } } } },
  });

  if (!block) {
    throw new Error("Block not found.");
  }

  await requireProjectAccessBySlug(prisma, block.document.project.slug, action);
}

async function requireProjectAccessByAssistantActionId(
  prisma: ReturnType<typeof getPrismaClient>,
  actionId: string,
  action: StudioProjectAccessAction,
) {
  const assistantAction = await prisma.studioAssistantAction.findUnique({
    where: { id: actionId },
    select: { session: { select: { projectId: true } } },
  });

  if (!assistantAction) {
    throw new Error("Assistant action not found.");
  }

  await requireProjectAccessByProjectId(prisma, assistantAction.session.projectId, action);
}

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

function studioDbCategoryForQuipslyCategory(category: string): StudioTagCategory {
  if (category === "chapter" || category === "episode") return "structure";
  if (category === "quote" || category === "educational" || category === "content_role") return "meaning";
  if (category === "media" || category === "social-clip") return "source";
  if (category === "workflow_status" || category === "internal_note") return "review";
  if (
    category === "meaning"
    || category === "structure"
    || category === "source"
    || category === "projection"
    || category === "review"
  ) return category;
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

function createUnavailableWorkbenchState(projectSlug = DEFAULT_PROJECT_SLUG): WorkbenchBaseState {
  const config = projectConfig(projectSlug);

  return {
    // Never substitute convincing manuscript content when canonical persistence
    // is unavailable. The Workspace renders a non-editable outage surface.
    blocks: [],
    views: [],
    projectTags: [],
    documentTags: [],
    projectId: UNAVAILABLE_PROJECT_ID,
    projectSlug: config.slug,
    projectName: config.name,
    documentId: UNAVAILABLE_DOCUMENT_ID,
    documentTitle: "Writing desk unavailable",
    documentUpdatedAt: new Date(0).toISOString(),
    documentTagRevision: 0,
    persistenceMode: "unavailable" as const
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
  if (config.slug !== DEV_PROJECT_SLUG) {
    return {
      ok: false as const,
      state: "rejected" as const,
      code: "DEVELOPMENT_SEED_FORBIDDEN" as const,
      error: "Development starter data can only be created inside the isolated Quipsly development Nest.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; the writing desk will render unavailable.", error);
    return {
      ok: false as const,
      state: "unavailable" as const,
      code: "PERSISTENCE_UNAVAILABLE" as const,
      error: "The writing database is unavailable, so no starter content was created.",
    };
  }

  await requireProjectAccessBySlug(prisma, config.slug, "write");
  const { project, document } = await lookupStudioProjectDocument(prisma, config.slug);
  const seedNestKind = nestKindFromSourceLabel(project.sourceLabel) || config.nestKind;

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

  return { ok: true as const, state: "persisted" as const, projectId: project.id, documentId: document.id };
}

export async function loadWorkbenchState(projectSlug = DEFAULT_PROJECT_SLUG, documentId?: string): Promise<WorkbenchBaseState | null> {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; refusing to substitute an editable manuscript.", error);
    return createUnavailableWorkbenchState(projectSlug);
  }

  const normalizedProjectSlug = projectConfig(projectSlug).slug;
  await requireProjectAccessBySlug(prisma, normalizedProjectSlug, "read");

  // Try to load with viewDefinitions (schema-optional), fallback to without if not yet pushed
  // Try to load with viewDefinitions (schema-optional), fallback to without if not yet pushed
  let project = null;
  try {
    project = await prisma.studioProject.findFirst({
      where: { slug: normalizedProjectSlug },
      include: {
        tags: true,
        viewDefinitions: true,
        documents: {
          where: documentId ? { id: documentId } : undefined,
          orderBy: { updatedAt: "desc" },
          include: {
            tagLinks: {
              orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
              include: { tag: true },
            },
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
      where: { slug: normalizedProjectSlug },
      include: {
        tags: true,
        documents: {
          where: documentId ? { id: documentId } : undefined,
          orderBy: { updatedAt: "desc" },
          include: {
            tagLinks: {
              orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
              include: { tag: true },
            },
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

  const projectDocuments = await prisma.studioDocument.findMany({
    where: { projectId: project.id },
    select: {
      id: true,
      title: true,
      sourceLabel: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Format into our UI shape
  const document = project.documents[0];
  if (!document) return null;

  if (await ensureDevLabShowTags(prisma, project, document)) {
    return loadWorkbenchState(projectSlug, documentId);
  }

  const blocks = document.blocks.map((b) => ({
    id: b.id,
    text: b.body,
    tags: Array.from(new Set(b.taggedSpans.map((ts) => ts.tag.slug))),
    ...(b.externalId?.startsWith("annotation:") ? { sourceEvidence: {
      annotationId: b.externalId!.slice("annotation:".length),
      citationLabel: b.sourceLabel || "Quipsly source evidence",
      sourcePath: b.sourcePath || undefined,
      immutable: false,
    } } : isImmutableTranscriptSourceExternalId(b.externalId) ? { sourceEvidence: {
      annotationId: b.externalId!,
      citationLabel: b.sourceLabel || "Recording-backed transcript evidence",
      sourcePath: b.sourcePath || undefined,
      immutable: true,
    } } : {}),
    spans: b.taggedSpans.map((ts) => ({
      id: ts.id,
      tagSlug: ts.tag.slug,
      label: ts.tag.label,
      category: quipslyCategoryForTag(ts.tag),
      startOffset: ts.startOffset,
      endOffset: ts.endOffset,
      selectedText: ts.selectedText,
      noteBody: ts.noteBody ?? undefined,
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
  const projectTags = project.tags
    .filter((tag) => tag.isActive && !tag.archivedAt && !tag.mergedIntoTagId)
    .map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      category: quipslyCategoryForTag(tag),
      ...(tag.description ? { description: tag.description } : {}),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const documentTags = (document.tagLinks ?? [])
    .map((link) => link.tag)
    .filter((tag) => tag.projectId === project.id && tag.isActive && !tag.archivedAt && !tag.mergedIntoTagId)
    .map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      category: quipslyCategoryForTag(tag),
      ...(tag.description ? { description: tag.description } : {}),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    blocks,
    views: effectiveViews,
    projectTags,
    documentTags,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    projectNestKind: nestKindFromSourceLabel(project.sourceLabel),
    workflowSystem: workflowSystemForNestKind(project.sourceLabel),
    documentId: document.id,
    documentTitle: document.title,
    documentUpdatedAt: (document.updatedAt instanceof Date ? document.updatedAt : new Date(document.updatedAt ?? 0)).toISOString(),
    documentTagRevision: document.tagRevision ?? 0,
    projectDocuments,
    persistenceMode: "database" as const
  };
}

async function loadLinkedScopeSummary(projectSlug: string): Promise<WorkbenchScopeProjectSummary> {
  const normalizedSlug = normalizeProjectSlug(projectSlug);
  const config = projectConfig(normalizedSlug);

  try {
    const actorEmail = await getActorEmail();
    const canReadScope = await canAccessStudioProjectBySlug({
      projectSlug: normalizedSlug,
      email: actorEmail,
      action: "read",
    });

    if (!canReadScope) {
      return {
        projectId: "",
        projectSlug: normalizedSlug,
        projectName: config.name,
        projectNestKind: config.nestKind,
        workflowSystem: workflowSystemForNestKind(config.nestKind),
        status: "denied",
        persistenceMode: "unavailable",
        reason: "No read access for this Nest."
      };
    }

    const prisma = getPrismaClient();
    const workspace = await ensureStudioWorkspace(prisma);
    const project = await prisma.studioProject.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: normalizedSlug
        }
      },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 1
        }
      }
    });

    if (!project) {
      return {
        projectId: "",
        projectSlug: normalizedSlug,
        projectName: config.name,
        projectNestKind: config.nestKind,
        workflowSystem: workflowSystemForNestKind(config.nestKind),
        status: "missing",
        persistenceMode: "unavailable",
        reason: "This Nest does not exist in this workspace."
      };
    }

    const summary = projectToScopeSummary(project, {
      projectSlug: normalizedSlug,
      projectName: config.name
    });

    if (summary) return summary;
    return {
      projectId: project.id,
      projectSlug: normalizedSlug,
      projectName: config.name,
      projectNestKind: nestKindFromSourceLabel(project?.sourceLabel ?? null),
      workflowSystem: workflowSystemForNestKind(project?.sourceLabel ?? null),
      status: "missing",
      persistenceMode: "database",
      reason: "No document available for this Nest."
    };
  } catch (error) {
    return buildUnavailableScopeSummary(
      normalizedSlug,
      "unavailable",
      error instanceof Error ? error.message : "Unable to load scope"
    );
  }
}

export async function loadWorkbenchStateWithScope(
  projectSlug = DEFAULT_PROJECT_SLUG,
  scopeProjectSlugs: ScopeProjectSlugsInput = [],
  documentId?: string
): Promise<WorkbenchScopedState | null> {
  const primary = await loadWorkbenchState(projectSlug, documentId);
  if (!primary) return null;

  const normalizedPrimary = normalizeProjectSlug(primary.projectSlug);
  const linkedProjectSlugs = normalizeScopeSlugs(scopeProjectSlugs, normalizedPrimary);
  if (linkedProjectSlugs.length === 0) {
    return { ...primary, linkedProjects: [] };
  }

  const summaries = await Promise.all(
    linkedProjectSlugs.map(async (slug) => {
      const fallback = buildUnavailableScopeSummary(
        slug,
        "unavailable",
        "This Nest is temporarily unavailable."
      );

      try {
        return await loadLinkedScopeSummary(slug);
      } catch {
        return fallback;
      }
    })
  );

  return { ...primary, linkedProjects: summaries };
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

  await requireProjectAccessByBlockId(prisma, blockId, "write");

  const existingBlock = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    select: {
      body: true,
      externalId: true,
      documentId: true,
      document: { select: { projectId: true } },
    },
  });

  if (!existingBlock) return;
  assertMutableWritingBlock(existingBlock.externalId);

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: { body: newText }
  });
  await recordDocumentOperation(prisma, {
    projectId: existingBlock.document.projectId,
    documentId: existingBlock.documentId,
    operationType: "block-content-save",
    beforeJson: {
      blockId,
      body: existingBlock.body,
    },
    afterJson: {
      blockId,
      body: newText,
    },
    payloadJson: {
      blockId,
      previousLength: existingBlock.body.length,
      nextLength: newText.length,
    },
  });
  syncBlocksToQuipslyNote(existingBlock.documentId).catch(console.error);
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

  await requireProjectAccessByBlockId(prisma, blockId, "write");

  const existingBlock = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    select: {
      body: true,
      externalId: true,
      archivedAt: true,
      archivedByLabel: true,
      documentId: true,
      document: { select: { projectId: true } },
    },
  });

  if (!existingBlock) return;
  assertMutableWritingBlock(existingBlock.externalId);
  const archivedAt = new Date();

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: {
      archivedAt,
      archivedByLabel: "quipsly-editor"
    }
  });
  await recordDocumentOperation(prisma, {
    projectId: existingBlock.document.projectId,
    documentId: existingBlock.documentId,
    operationType: "block-archive",
    beforeJson: {
      blockId,
      archivedAt: existingBlock.archivedAt?.toISOString() ?? null,
      archivedByLabel: existingBlock.archivedByLabel,
      body: existingBlock.body,
    },
    afterJson: {
      blockId,
      archivedAt: archivedAt.toISOString(),
      archivedByLabel: "quipsly-editor",
    },
    payloadJson: { blockId },
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

  await requireProjectAccessByBlockId(prisma, blockId, "write");

  const existingBlock = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    select: {
      body: true,
      archivedAt: true,
      archivedByLabel: true,
      documentId: true,
      document: { select: { projectId: true } },
    },
  });

  if (!existingBlock) return;

  await prisma.studioDocumentBlock.update({
    where: { id: blockId },
    data: {
      archivedAt: null,
      archivedByLabel: null
    }
  });
  await recordDocumentOperation(prisma, {
    projectId: existingBlock.document.projectId,
    documentId: existingBlock.documentId,
    operationType: "block-unarchive",
    beforeJson: {
      blockId,
      archivedAt: existingBlock.archivedAt?.toISOString() ?? null,
      archivedByLabel: existingBlock.archivedByLabel,
      body: existingBlock.body,
    },
    afterJson: {
      blockId,
      archivedAt: null,
      archivedByLabel: null,
    },
    payloadJson: { blockId },
  });

  revalidatePath('/');
  revalidatePath('/create');
}

export async function restoreBlockState(
  blockId: string,
  rawText: string,
  rawSpans: Array<{ tagSlug: string; startOffset: number; endOffset: number; selectedText: string; noteBody?: string }> = []
) {
  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn("DATABASE_URL is not set; skipping offline restoreBlockState.", error);
    return;
  }

  if (blockId.startsWith("offline-") || blockId.startsWith("pending-")) return;

  await requireProjectAccessByBlockId(prisma, blockId, "write");

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
  assertMutableWritingBlock(block.externalId);

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
      const safeNoteBody = typeof span.noteBody === "string"
        ? span.noteBody.trim().slice(0, 20_000)
        : "";
      return {
        tagSlug: safeSlug,
        startOffset: safeStart,
        endOffset: safeEnd,
        selectedText: safeSelectedText,
        noteBody: safeNoteBody || null,
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
        noteBody: span.noteBody,
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

export type PastePlainTextBlocksResult =
  | {
      ok: true;
      state: "persisted";
      operationId: string;
      currentBlock: { id: string; text: string; tags: string[]; spans: [] };
      newBlocks: Array<{ id: string; text: string; tags: string[]; spans: [] }>;
    }
  | {
      ok: false;
      state: "rejected" | "unavailable";
      code: "AUTH_REQUIRED" | "ACCESS_NOT_VERIFIED" | "INVALID_PASTE" | "PROTECTED_BLOCK" | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

export async function pastePlainTextBlocksAction(
  blockId: string,
  rawChunks: string[],
  rawSelectionStart: number,
  rawSelectionEnd: number,
): Promise<PastePlainTextBlocksResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in before splitting pasted writing into blocks." };
  }
  const chunks = Array.isArray(rawChunks)
    ? rawChunks.map((chunk) => typeof chunk === "string" ? chunk.trim() : "").filter(Boolean)
    : [];
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (chunks.length < 2 || chunks.length > 500 || totalLength > 2_000_000
    || !Number.isSafeInteger(rawSelectionStart) || !Number.isSafeInteger(rawSelectionEnd)) {
    return { ok: false, state: "rejected", code: "INVALID_PASTE", error: "That paste cannot be safely split into writing blocks." };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
    await requireProjectAccessByBlockId(prisma, blockId, "write");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("do not have") || message === "Block not found.") {
      return { ok: false, state: "rejected", code: "ACCESS_NOT_VERIFIED", error: "Quipsly could not verify write access. Nothing was pasted." };
    }
    console.error("Paste could not verify document access.", error);
    return { ok: false, state: "unavailable", code: "PERSISTENCE_UNAVAILABLE", error: "The writing database is unavailable. Nothing was pasted." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const block = await tx.studioDocumentBlock.findUnique({
        where: { id: blockId },
        select: {
          id: true,
          stableId: true,
          documentId: true,
          order: true,
          body: true,
          sourceLabel: true,
          sourcePath: true,
          externalId: true,
          projectionStatus: true,
          isPrivate: true,
          document: { select: { projectId: true } },
          taggedSpans: { select: { id: true }, take: 1 },
          sourceAnnotationUses: { select: { id: true }, take: 1 },
        },
      });
      if (!block) throw new DocumentReorderError("DOCUMENT_NOT_FOUND", "Block not found.");
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${block.documentId}, 0))`;
      if (isImmutableTranscriptSourceExternalId(block.externalId)) {
        throw new DocumentSafetyError("IDENTITY_MISMATCH", "Transcript source evidence is immutable. Paste into the linked draft block instead.");
      }
      if (block.taggedSpans.length > 0 || block.sourceAnnotationUses.length > 0 || block.externalId?.startsWith("annotation:")) {
        throw new DocumentSafetyError("IDENTITY_MISMATCH", "Source-linked or tagged writing stays in one block so its anchors remain trustworthy.");
      }

      const selectionStart = Math.max(0, Math.min(rawSelectionStart, block.body.length));
      const selectionEnd = Math.max(selectionStart, Math.min(rawSelectionEnd, block.body.length));
      const beforeSelection = block.body.slice(0, selectionStart);
      const afterSelection = block.body.slice(selectionEnd);
      const currentText = `${beforeSelection}${chunks[0]}`;
      const insertedBodies = chunks.slice(1).map((chunk, index, rest) => index === rest.length - 1 ? `${chunk}${afterSelection}` : chunk);
      const following = await tx.studioDocumentBlock.findMany({
        where: { documentId: block.documentId, order: { gt: block.order } },
        orderBy: { order: "desc" },
        select: { id: true, order: true },
      });
      for (const item of following) {
        await tx.studioDocumentBlock.update({ where: { id: item.id }, data: { order: item.order + insertedBodies.length } });
      }
      await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { body: currentText } });

      const operationGroup = randomUUID();
      const newBlocks = [] as Array<{ id: string; text: string; tags: string[]; spans: [] }>;
      for (const [index, body] of insertedBodies.entries()) {
        const created = await tx.studioDocumentBlock.create({
          data: {
            documentId: block.documentId,
            stableId: `${block.stableId}-paste-${operationGroup}-${index + 1}`,
            order: block.order + index + 1,
            body,
            sourceLabel: block.sourceLabel,
            sourcePath: block.sourcePath,
            projectionStatus: block.projectionStatus,
            isPrivate: block.isPrivate,
          },
          select: { id: true, body: true },
        });
        newBlocks.push({ id: created.id, text: created.body, tags: [], spans: [] });
      }
      await tx.studioDocument.update({ where: { id: block.documentId }, data: { updatedAt: new Date() } });
      const operation = await tx.studioDocumentOperation.create({
        data: {
          projectId: block.document.projectId,
          documentId: block.documentId,
          groupId: operationGroup,
          actorEmail,
          origin: "human",
          operationType: "paste-split-blocks",
          beforeJson: toPrismaJson({ blockId: block.id, body: block.body, order: block.order }),
          afterJson: toPrismaJson({
            currentBlock: { id: block.id, body: currentText, order: block.order },
            newBlocks: newBlocks.map((item, index) => ({ id: item.id, body: item.text, order: block.order + index + 1 })),
          }),
          payloadJson: toPrismaJson({ chunkCount: chunks.length, selectionStart, selectionEnd }),
          reversible: true,
        },
        select: { id: true },
      });
      return {
        documentId: block.documentId,
        operationId: operation.id,
        currentBlock: { id: block.id, text: currentText, tags: [], spans: [] as [] },
        newBlocks,
      };
    });
    revalidatePath("/create");
    void syncBlocksToQuipslyNote(result.documentId).catch((error) => console.error("Pasted blocks saved, but note projection sync failed.", error));
    const { documentId: _documentId, ...receipt } = result;
    return { ok: true, state: "persisted", ...receipt };
  } catch (error) {
    if (error instanceof DocumentSafetyError) {
      return { ok: false, state: "rejected", code: "PROTECTED_BLOCK", error: error.message };
    }
    if (error instanceof DocumentReorderError) {
      return { ok: false, state: "rejected", code: "INVALID_PASTE", error: error.message };
    }
    console.error("Atomic multi-block paste failed.", error);
    return { ok: false, state: "unavailable", code: "PERSISTENCE_UNAVAILABLE", error: "The pasted blocks were not saved. Your canonical document was left unchanged." };
  }
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

  await requireProjectAccessByBlockId(prisma, blockId, "write");

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
  assertMutableWritingBlock(block.externalId);

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
            createdByLabel: span.createdByLabel,
            noteBody: span.noteBody,
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

  syncBlocksToQuipslyNote(block.documentId).catch(console.error);
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

  await requireProjectAccessByBlockId(prisma, blockId, "write");

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
  assertMutableWritingBlock(block.externalId);
  assertMutableWritingBlock(previousBlock.externalId);

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
          createdByLabel: span.createdByLabel,
          noteBody: span.noteBody,
        }
      });
    }

    await tx.studioDocumentBlock.delete({ where: { id: block.id } });
  });

  syncBlocksToQuipslyNote(block.documentId).catch(console.error);
  revalidatePath('/');
  revalidatePath('/create');

  return {
    mergedBlockId: previousBlock.id,
    mergedText
  };
}

export type ToggleBlockTagResult =
  | {
      ok: true;
      state: "persisted";
      operation: "added";
      operationId: string;
      spanId: string;
    }
  | {
      ok: true;
      state: "persisted";
      operation: "removed";
      operationId: string;
      removedSpanIds: string[];
    }
  | {
      ok: false;
      state: "rejected" | "unavailable";
      code: "INVALID_INPUT" | "ACCESS_NOT_VERIFIED" | "NOT_FOUND" | "IDENTITY_MISMATCH" | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

export async function replaceDocumentTagsAction(input: {
  documentId: string;
  tagIds: string[];
  expectedUpdatedAt: string;
  expectedTagRevision: number;
  clientRequestId?: string;
}): Promise<DocumentTagActionResult> {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = (session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  if (!actorUserId || !actorEmail) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing document tags." };
  }

  try {
    const result = await replaceWorkEntityTags({
      prisma: getPrismaClient(),
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: input?.documentId,
      tagIds: input?.tagIds,
      expectedUpdatedAt: new Date(input?.expectedUpdatedAt),
      expectedTagRevision: input?.expectedTagRevision,
      clientRequestId: input?.clientRequestId,
      surface: "nest-writing",
    });
    if (!result.ok) return result;
    revalidatePath("/create");
    revalidatePath("/notebooks");
    revalidatePath("/library");
    revalidatePath("/find");
    if (result.tagRevision === null) {
      return { ok: false, code: "UNAVAILABLE", error: "Quipsly did not return the document-tag revision. Your saved tags remain on the server; refresh before editing them again." };
    }
    return {
      ok: true,
      documentId: result.entityId,
      projectId: result.projectId,
      tagIds: result.tagIds,
      updatedAt: result.updatedAt.toISOString(),
      tagRevision: result.tagRevision,
      receiptId: result.receiptId,
      idempotentReplay: result.idempotentReplay,
    };
  } catch (error) {
    console.error("Could not replace canonical document tags.", error);
    return { ok: false, code: "UNAVAILABLE", error: "Document tags are unavailable right now. Your prior tags were not changed." };
  }
}

export async function createAndAssignDocumentTagAction(input: {
  documentId: string;
  label: string;
  expectedUpdatedAt: string;
  expectedTagRevision: number;
}): Promise<CreateDocumentTagActionResult> {
  const session = await auth();
  const actorUserId = session?.user?.id;
  const actorEmail = (session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  if (!actorUserId || !actorEmail) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before expanding this Nest’s vocabulary." };
  }

  try {
    const result = await createAndAssignWorkEntityTag({
      prisma: getPrismaClient(),
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: input?.documentId,
      label: input?.label,
      expectedUpdatedAt: new Date(input?.expectedUpdatedAt),
      expectedTagRevision: input?.expectedTagRevision,
    });
    if (!result.ok) return result;
    revalidatePath("/create");
    revalidatePath("/notebooks");
    revalidatePath("/library");
    revalidatePath("/find");
    if (result.tagRevision === null) {
      return { ok: false, code: "UNAVAILABLE", error: "Quipsly did not return the document-tag revision. The tag may have been applied; refresh before editing tags again." };
    }
    return {
      ok: true,
      documentId: result.entityId,
      projectId: result.projectId,
      tag: result.tag,
      created: result.created,
      assignmentChanged: result.assignmentChanged,
      updatedAt: result.updatedAt.toISOString(),
      tagRevision: result.tagRevision,
      receiptId: result.receiptId,
    };
  } catch (error) {
    console.error("Could not create a canonical document tag.", error);
    return { ok: false, code: "UNAVAILABLE", error: "The Nest vocabulary is unavailable right now. No tag was created." };
  }
}

export async function toggleBlockTag(
  blockId: string,
  documentId: string,
  projectId: string,
  tagSlug: string,
  text: string,
  selection?: { startOffset: number; endOffset: number; selectedText: string },
): Promise<ToggleBlockTagResult> {
  void text;
  const cleanBlockId = typeof blockId === "string" ? blockId.trim().slice(0, 200) : "";
  const cleanDocumentId = typeof documentId === "string" ? documentId.trim().slice(0, 200) : "";
  const cleanProjectId = typeof projectId === "string" ? projectId.trim().slice(0, 200) : "";
  const cleanTagSlug = typeof tagSlug === "string" && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(tagSlug)
    ? tagSlug.slice(0, 80)
    : "";
  if (
    !cleanBlockId
    || !cleanDocumentId
    || !cleanProjectId
    || !cleanTagSlug
    || cleanProjectId === UNAVAILABLE_PROJECT_ID
    || cleanDocumentId === UNAVAILABLE_DOCUMENT_ID
    || cleanBlockId.startsWith("offline-")
  ) {
    return {
      ok: false,
      state: "rejected",
      code: "INVALID_INPUT",
      error: "The tag target is incomplete or invalid.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Writing tag could not open persistence.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The writing database is unavailable. The tag was not changed.",
    };
  }

  try {
    await requireProjectAccessByProjectId(prisma, cleanProjectId, "write");
  } catch (error) {
    console.error("Writing tag could not verify write access.", error);
    return {
      ok: false,
      state: "rejected",
      code: "ACCESS_NOT_VERIFIED",
      error: "Editor access to this Nest is required to change tags.",
    };
  }

  try {
    const [document, block] = await Promise.all([
      prisma.studioDocument.findUnique({
        where: { id: cleanDocumentId },
        select: { id: true, projectId: true, stableId: true, title: true },
      }),
      prisma.studioDocumentBlock.findUnique({
        where: { id: cleanBlockId },
        select: {
          id: true,
          documentId: true,
          stableId: true,
          body: true,
          title: true,
          sourceLabel: true,
          sourcePath: true,
          externalId: true,
          projectionStatus: true,
          isPrivate: true,
        },
      }),
    ]);
    if (!document || !block) {
      return {
        ok: false,
        state: "rejected",
        code: "NOT_FOUND",
        error: "The writing block or document no longer exists.",
      };
    }
    if (document.projectId !== cleanProjectId || block.documentId !== cleanDocumentId) {
      return {
        ok: false,
        state: "rejected",
        code: "IDENTITY_MISMATCH",
        error: "The tag target does not belong to this Nest and document.",
      };
    }

    const isStructureTag = STRUCTURE_TAG_SLUGS.includes(cleanTagSlug);
    const startOffset = isStructureTag ? 0 : selection?.startOffset ?? 0;
    const endOffset = isStructureTag ? block.body.length : selection?.endOffset ?? block.body.length;
    const selectedText = isStructureTag ? block.body : selection?.selectedText ?? block.body;
    if (
      !Number.isSafeInteger(startOffset)
      || !Number.isSafeInteger(endOffset)
      || startOffset < 0
      || endOffset <= startOffset
      || endOffset > block.body.length
      || block.body.slice(startOffset, endOffset) !== selectedText
    ) {
      return {
        ok: false,
        state: "rejected",
        code: "IDENTITY_MISMATCH",
        error: "The passage changed or the selection no longer matches. Select it again before tagging.",
      };
    }

    const actorEmail = await getActorEmail();
    const operation = await prisma.$transaction(async (tx) => {
      let tag = await tx.studioTag.findUnique({
        where: { projectId_slug: { projectId: cleanProjectId, slug: cleanTagSlug } },
      });
      if (!tag) {
        const seed = SEED_TAGS.find((candidate) => candidate.slug === cleanTagSlug);
        if (!seed) return { kind: "missing-tag" as const };
        tag = await tx.studioTag.create({
          data: {
            projectId: cleanProjectId,
            slug: seed.slug,
            label: seed.label,
            category: studioDbCategoryForQuipslyCategory(seed.category),
            isPrivate: true,
            isActive: true,
          },
        });
      }
      if (!tag.isActive || tag.archivedAt || tag.mergedIntoTagId) {
        return { kind: "missing-tag" as const };
      }

      const existingSpans = await tx.studioTaggedSpan.findMany({
        where: isStructureTag
          ? { blockId: cleanBlockId, tagId: tag.id }
          : { blockId: cleanBlockId, tagId: tag.id, startOffset, endOffset },
      });
      if (existingSpans.length > 0) {
        await tx.studioTaggedSpan.deleteMany({
          where: { id: { in: existingSpans.map((span) => span.id) } },
        });
        const receipt = await tx.studioDocumentOperation.create({
          data: {
            projectId: cleanProjectId,
            documentId: cleanDocumentId,
            actorEmail,
            origin: "human",
            operationType: "tag-remove",
            status: "applied",
            beforeJson: toPrismaJson({
              blockId: cleanBlockId,
              tagSlug: cleanTagSlug,
              spans: existingSpans.map((span) => ({
                id: span.id,
                startOffset: span.startOffset,
                endOffset: span.endOffset,
                selectedText: span.selectedText,
              })),
            }),
            afterJson: toPrismaJson({ blockId: cleanBlockId, tagSlug: cleanTagSlug, spans: [] }),
            payloadJson: toPrismaJson({ blockId: cleanBlockId, tagSlug: cleanTagSlug, isStructureTag }),
            reversible: true,
          },
          select: { id: true },
        });
        await tx.studioDocument.update({ where: { id: cleanDocumentId }, data: { updatedAt: new Date() } });
        return {
          kind: "removed" as const,
          operationId: receipt.id,
          removedSpanIds: existingSpans.map((span) => span.id),
        };
      }

      let removedCompetingTagSlugs: string[] = [];
      if (isStructureTag) {
        const competingTags = await tx.studioTag.findMany({
          where: {
            projectId: cleanProjectId,
            slug: { in: STRUCTURE_TAG_SLUGS.filter((slug) => slug !== cleanTagSlug) },
          },
          select: { id: true, slug: true },
        });
        removedCompetingTagSlugs = competingTags.map((competingTag) => competingTag.slug);
        await tx.studioTaggedSpan.deleteMany({
          where: {
            blockId: cleanBlockId,
            tagId: { in: competingTags.map((competingTag) => competingTag.id) },
          },
        });
      }

      const span = await tx.studioTaggedSpan.create({
        data: {
          documentId: cleanDocumentId,
          blockId: cleanBlockId,
          tagId: tag.id,
          startOffset,
          endOffset,
          selectedText,
          documentStableId: document.stableId,
          documentTitleSnapshot: document.title,
          blockStableId: block.stableId,
          blockTitleSnapshot: block.title,
          sourceLabel: block.sourceLabel,
          sourcePath: block.sourcePath,
          sourceExternalId: block.externalId,
          projectionStatus: block.projectionStatus,
          isPrivate: block.isPrivate,
          createdByLabel: actorEmail,
        },
      });
      const receipt = await tx.studioDocumentOperation.create({
        data: {
          projectId: cleanProjectId,
          documentId: cleanDocumentId,
          actorEmail,
          origin: "human",
          operationType: "tag-add",
          status: "applied",
          beforeJson: toPrismaJson({
            blockId: cleanBlockId,
            tagSlug: cleanTagSlug,
            spans: [],
            removedCompetingTagSlugs,
          }),
          afterJson: toPrismaJson({
            blockId: cleanBlockId,
            tagSlug: cleanTagSlug,
            span: {
              id: span.id,
              startOffset,
              endOffset,
              selectedText: selectedText.slice(0, 1600),
            },
          }),
          payloadJson: toPrismaJson({
            blockId: cleanBlockId,
            tagSlug: cleanTagSlug,
            isStructureTag,
            removedCompetingTagSlugs,
          }),
          reversible: true,
        },
        select: { id: true },
      });
      await tx.studioDocument.update({ where: { id: cleanDocumentId }, data: { updatedAt: new Date() } });
      return {
        kind: "added" as const,
        operationId: receipt.id,
        spanId: span.id,
      };
    });

    if (operation.kind === "missing-tag") {
      return {
        ok: false,
        state: "rejected",
        code: "NOT_FOUND",
        error: "That Nest tag is unavailable, archived, or redirected. Refresh the vocabulary before using it.",
      };
    }
    revalidatePath("/");
    revalidatePath("/create");
    if (operation.kind === "added") {
      return {
        ok: true,
        state: "persisted",
        operation: "added",
        operationId: operation.operationId,
        spanId: operation.spanId,
      };
    }
    return {
      ok: true,
      state: "persisted",
      operation: "removed",
      operationId: operation.operationId,
      removedSpanIds: operation.removedSpanIds,
    };
  } catch (error) {
    console.error("Writing tag persistence failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The tag could not be saved. Existing writing and vocabulary were left unchanged.",
    };
  }
}

export type CreatePassageTagActionResult =
  | {
      ok: true;
      state: "persisted";
      spanId: string;
      operationId: string | null;
      reusedApplication: boolean;
      createdTag: boolean;
      tag: {
        id: string;
        slug: string;
        label: string;
        category: string;
        projectId: string;
      };
    }
  | {
      ok: false;
      state: "rejected" | "unavailable";
      code:
        | "AUTH_REQUIRED"
        | "INVALID_INPUT"
        | "ACCESS_NOT_VERIFIED"
        | "SELECTION_CHANGED"
        | "SLUG_CONFLICT"
        | "ARCHIVED"
        | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

export async function createAndApplyPassageTag(input: {
  blockId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  label: string;
}): Promise<CreatePassageTagActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return {
      ok: false,
      state: "rejected",
      code: "AUTH_REQUIRED",
      error: "Sign in before creating a reusable passage tag.",
    };
  }

  const blockId = typeof input?.blockId === "string" ? input.blockId.trim().slice(0, 200) : "";
  const startOffset = Math.trunc(input?.startOffset);
  const endOffset = Math.trunc(input?.endOffset);
  const selectedText = typeof input?.selectedText === "string" ? input.selectedText : "";
  const label = normalizeWorkTagLabel(input?.label);
  if (
    !blockId
    || !Number.isSafeInteger(startOffset)
    || !Number.isSafeInteger(endOffset)
    || startOffset < 0
    || endOffset <= startOffset
    || !selectedText
    || !label
  ) {
    return {
      ok: false,
      state: "rejected",
      code: "INVALID_INPUT",
      error: "Select an exact passage and enter a reusable tag name of 80 characters or fewer.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Passage tag creation could not open persistence.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The writing database is unavailable. No tag was created or applied.",
    };
  }

  try {
    await requireProjectAccessByBlockId(prisma, blockId, "write");
  } catch (error) {
    console.error("Passage tag creation could not verify write access.", error);
    return {
      ok: false,
      state: "rejected",
      code: "ACCESS_NOT_VERIFIED",
      error: "Editor access to this Nest is required to create reusable tags.",
    };
  }

  try {
    const block = await prisma.studioDocumentBlock.findUnique({
      where: { id: blockId },
      select: {
        id: true,
        stableId: true,
        title: true,
        body: true,
        sourceLabel: true,
        sourcePath: true,
        externalId: true,
        projectionStatus: true,
        isPrivate: true,
        document: {
          select: {
            id: true,
            stableId: true,
            title: true,
            projectId: true,
          },
        },
      },
    });
    if (
      !block
      || endOffset > block.body.length
      || block.body.slice(startOffset, endOffset) !== selectedText
    ) {
      return {
        ok: false,
        state: "rejected",
        code: "SELECTION_CHANGED",
        error: "The passage changed or the selection no longer matches. Select it again before tagging.",
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const resolvedTag = await resolveReusableProjectTag({
        tx,
        projectId: block.document.projectId,
        label,
      });
      if (!resolvedTag.ok) return { kind: "tag-error" as const, failure: resolvedTag };

      const existing = await tx.studioTaggedSpan.findUnique({
        where: {
          blockId_tagId_startOffset_endOffset: {
            blockId,
            tagId: resolvedTag.tag.id,
            startOffset,
            endOffset,
          },
        },
        select: { id: true, selectedText: true },
      });
      if (existing) {
        if (existing.selectedText !== selectedText) {
          return { kind: "selection-changed" as const };
        }
        return {
          kind: "saved" as const,
          spanId: existing.id,
          operationId: null,
          reusedApplication: true,
          resolvedTag,
        };
      }

      const span = await tx.studioTaggedSpan.create({
        data: {
          documentId: block.document.id,
          blockId,
          tagId: resolvedTag.tag.id,
          startOffset,
          endOffset,
          selectedText,
          documentStableId: block.document.stableId,
          documentTitleSnapshot: block.document.title,
          blockStableId: block.stableId,
          blockTitleSnapshot: block.title,
          sourceLabel: block.sourceLabel,
          sourcePath: block.sourcePath,
          sourceExternalId: block.externalId,
          projectionStatus: block.projectionStatus,
          isPrivate: block.isPrivate,
          createdByLabel: actorEmail,
        },
        select: { id: true },
      });
      const operation = await tx.studioDocumentOperation.create({
        data: {
          projectId: block.document.projectId,
          documentId: block.document.id,
          actorEmail,
          origin: "human",
          operationType: "tag-add",
          status: "applied",
          beforeJson: toPrismaJson({
            blockId,
            tagId: resolvedTag.tag.id,
            tagSlug: resolvedTag.tag.slug,
            spans: [],
          }),
          afterJson: toPrismaJson({
            blockId,
            tagId: resolvedTag.tag.id,
            tagSlug: resolvedTag.tag.slug,
            spanId: span.id,
            startOffset,
            endOffset,
            selectedText,
          }),
          payloadJson: toPrismaJson({
            blockId,
            tagId: resolvedTag.tag.id,
            tagSlug: resolvedTag.tag.slug,
            createdReusableTag: resolvedTag.created,
          }),
          reversible: true,
        },
        select: { id: true },
      });
      await tx.studioDocument.update({
        where: { id: block.document.id },
        data: { updatedAt: new Date() },
      });
      return {
        kind: "saved" as const,
        spanId: span.id,
        operationId: operation.id,
        reusedApplication: false,
        resolvedTag,
      };
    });

    if (result.kind === "tag-error") {
      return {
        ok: false,
        state: "rejected",
        code: result.failure.code,
        error: result.failure.error,
      };
    }
    if (result.kind === "selection-changed") {
      return {
        ok: false,
        state: "rejected",
        code: "SELECTION_CHANGED",
        error: "The passage changed or the selection no longer matches. Select it again before tagging.",
      };
    }

    revalidatePath("/create");
    return {
      ok: true,
      state: "persisted",
      spanId: result.spanId,
      operationId: result.operationId,
      reusedApplication: result.reusedApplication,
      createdTag: result.resolvedTag.created,
      tag: {
        id: result.resolvedTag.tag.id,
        slug: result.resolvedTag.tag.slug,
        label: result.resolvedTag.tag.label,
        category: String(result.resolvedTag.tag.category),
        projectId: result.resolvedTag.tag.projectId,
      },
    };
  } catch (error) {
    console.error("Passage tag creation failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "Quipsly could not create or apply that tag. Existing vocabulary and writing were not changed.",
    };
  }
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

  await requireProjectAccessByProjectId(prisma, document.projectId, "write");

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

    await requireProjectAccessBySlug(prisma, project.slug, "read");

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

    await requireProjectAccessBySlug(prisma, project.slug, "read");

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
    await requireProjectAccessByProjectId(prisma, projectId, "write");
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
      const showNotesParts: string[] = [];

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
          const isShowNote = spans.some(ts => ts.tag.slug.toLowerCase() === "show-note" || ts.tag.slug.toLowerCase() === "show_note");
          if (isShowNote) {
            showNotesParts.push(cleanText.trim());
          } else {
            bodyTextParts.push(cleanText.trim());
          }
        }
      }

      const bodyText = bodyTextParts.join("\n\n");
      const showNotesText = showNotesParts.join("\n\n");
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
          excludedBlocks, // Passed so Publisher Panel can display audit warnings
          domainPacket: {
            packetVersion: 1,
            id: `compiled-${segment.boundaryBlockId}`,
            kind: "episode-page",
            source: {
              projectSlug: project.slug,
              documentId: document.id,
              episodeSlug: cleanSlug,
              sourceBlockIds: bodyBlocks.map(b => b.id)
            },
            title: segment.label,
            slug: cleanSlug,
            summary,
            bodyMarkdown: bodyText || `<p>Draft content for ${segment.label}.</p>`,
            showNotesMarkdown: showNotesText || undefined,
            media: [],
            destinations: [
              { destination: "high-ground-odyssey", status: "packet-ready" }
            ],
            generatedFrom: "quipsly-editor",
            createdAt: new Date().toISOString(),
            savedAt: new Date().toISOString()
          }
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
    const session = await auth();
    const isOwner = session?.user?.email?.endsWith("@highgroundodyssey.com") || process.env.NODE_ENV === "development";

    const prisma = getPrismaClient();
    await requireProjectAccessByProjectId(prisma, projectId, "read");
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
  void candidateId;
  return {
    ok: false,
    errorCode: LEGACY_PUBLISHING_EXECUTION_RETIRED,
    error: LEGACY_PUBLISHING_EXECUTION_ERROR,
  };
}

export async function getEpisodeCandidatesBySlugAction(projectSlug: string) {
  try {
    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });
    if (!project) {
      return { ok: false, error: "Project not found." };
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

    await requireProjectAccessBySlug(prisma, project.slug, "read");

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

type AssistantMutationCode =
  | "AUTH_REQUIRED"
  | "ACCESS_NOT_VERIFIED"
  | "ACTION_NOT_FOUND"
  | "UNSUPPORTED_ACTION"
  | "INVALID_PAYLOAD"
  | "STALE_SOURCE"
  | "PERSISTENCE_UNAVAILABLE";

export type AssistantDocumentApplyReceipt = {
  actionId: string;
  operationId: string;
  projectId: string;
  documentId: string;
  blockId: string;
  kind: "rewrite" | "draft";
  text: string;
  insertAfterBlockId: string | null;
};

export type AssistantEntityCommitReceipt = {
  actionId: string;
  projectId: string;
  entityId: string;
  operation: "created" | "updated";
};

export type AssistantDecisionReceipt = {
  actionId: string;
  previousStatus: string;
  status: "proposed" | "approved" | "rejected";
};

type AssistantMutationResult<T> =
  | { ok: true; state: "persisted"; replay: boolean; receipt: T }
  | { ok: false; state: "rejected" | "unavailable"; code: AssistantMutationCode; error: string };

class AssistantMutationError extends Error {
  constructor(readonly code: Exclude<AssistantMutationCode, "AUTH_REQUIRED" | "ACCESS_NOT_VERIFIED" | "PERSISTENCE_UNAVAILABLE">, message: string) {
    super(message);
    this.name = "AssistantMutationError";
  }
}

function assistantRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assistantText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function parseAssistantReceipt<T>(notes: string | null | undefined): T | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { receipt?: T };
    return parsed.receipt ?? null;
  } catch {
    return null;
  }
}

async function lockAssistantAction(tx: Prisma.TransactionClient, actionId: string) {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${actionId}, 0))`;
}

async function prepareAssistantMutation(actionId: string) {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return {
      error: {
        ok: false as const,
        state: "rejected" as const,
        code: "AUTH_REQUIRED" as const,
        error: "Sign in before deciding an assistant proposal.",
      },
    };
  }

  try {
    const prisma = getPrismaClient();
    await requireProjectAccessByAssistantActionId(prisma, actionId, "write");
    return { prisma, actorEmail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("do not have write access") && message !== "Assistant action not found.") {
      console.error("Assistant mutation could not verify write access.", error);
    }
    return {
      error: {
        ok: false as const,
        state: "rejected" as const,
        code: "ACCESS_NOT_VERIFIED" as const,
        error: "Quipsly could not verify write access for this proposal. Nothing was changed.",
      },
    };
  }
}

export async function applyAssistantDocumentEditAction(
  actionId: string,
): Promise<AssistantMutationResult<AssistantDocumentApplyReceipt>> {
  const prepared = await prepareAssistantMutation(actionId);
  if (prepared.error) return prepared.error;
  const { prisma, actorEmail } = prepared;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAssistantAction(tx, actionId);
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
        include: {
          session: true,
          ledgers: {
            where: { newStatus: "applied" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      if (!action) throw new AssistantMutationError("ACTION_NOT_FOUND", "That assistant proposal no longer exists.");

      const priorReceipt = parseAssistantReceipt<AssistantDocumentApplyReceipt>(action.ledgers[0]?.notes);
      if (action.status === "applied" && priorReceipt) {
        return { replay: true, receipt: priorReceipt };
      }
      if (!["proposed", "approved"].includes(action.status)) {
        throw new AssistantMutationError("STALE_SOURCE", "This proposal has already been decided. Reload before applying it again.");
      }

      const documentId = action.session.documentId;
      if (!documentId) throw new AssistantMutationError("INVALID_PAYLOAD", "This proposal is not anchored to a document.");
      const document = await tx.studioDocument.findFirst({
        where: { id: documentId, projectId: action.session.projectId },
        select: {
          id: true,
          projectId: true,
          blocks: { select: { id: true, stableId: true, order: true, body: true }, orderBy: { order: "asc" } },
        },
      });
      if (!document) throw new AssistantMutationError("ACTION_NOT_FOUND", "The proposal's document is unavailable.");

      const payload = assistantRecord(action.payloadJson);
      const isRewrite = ["PROPOSE_REWRITE", "PROPOSE_CONTINUITY_FIX"].includes(action.kind);
      const isDraft = action.kind === "PROPOSE_DRAFT";
      if (!isRewrite && !isDraft) {
        throw new AssistantMutationError("UNSUPPORTED_ACTION", "Only reviewed draft and rewrite proposals can change manuscript blocks.");
      }

      let operationId = "";
      let blockId = "";
      let text = "";
      let insertAfterBlockId: string | null = null;

      if (isRewrite) {
        blockId = assistantText(payload.blockId ?? payload.targetBlockId, 160);
        const expectedText = typeof payload.originalText === "string" ? payload.originalText : "";
        text = typeof payload.rewriteText === "string" ? payload.rewriteText.trim() : "";
        if (!blockId || !expectedText || !text || text.length > 2_000_000) {
          throw new AssistantMutationError("INVALID_PAYLOAD", "The rewrite is missing its exact source block, original text, or replacement text.");
        }
        const block = document.blocks.find((candidate) => candidate.id === blockId);
        if (!block) throw new AssistantMutationError("ACTION_NOT_FOUND", "The rewrite's source block is unavailable.");
        if (block.body !== expectedText) {
          throw new AssistantMutationError("STALE_SOURCE", "The manuscript changed after this rewrite was proposed. Review a fresh diff; nothing was overwritten.");
        }

        await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { body: text } });
        const operation = await tx.studioDocumentOperation.create({
          data: {
            projectId: document.projectId,
            documentId: document.id,
            actorEmail,
            origin: "assistant",
            operationType: "assistant-rewrite-apply",
            beforeJson: toPrismaJson({ blockId: block.id, stableId: block.stableId, body: block.body }),
            afterJson: toPrismaJson({ blockId: block.id, stableId: block.stableId, body: text }),
            payloadJson: toPrismaJson({ assistantActionId: action.id, proposalKind: action.kind }),
            reversible: true,
          },
          select: { id: true },
        });
        operationId = operation.id;
      } else {
        text = typeof payload.draftText === "string" ? payload.draftText.trim() : "";
        if (!text || text.length > 2_000_000) {
          throw new AssistantMutationError("INVALID_PAYLOAD", "The draft proposal has no bounded draft text.");
        }
        const requestedTargetId = assistantText(payload.targetBlockId ?? payload.blockId, 160);
        const target = requestedTargetId
          ? document.blocks.find((candidate) => candidate.id === requestedTargetId)
          : null;
        if (requestedTargetId && !target) {
          throw new AssistantMutationError("STALE_SOURCE", "The requested insertion point no longer exists. Nothing was inserted.");
        }
        insertAfterBlockId = target?.id ?? null;
        const insertionOrder = target
          ? target.order + 1
          : (document.blocks.at(-1)?.order ?? -1) + 1;
        for (const block of [...document.blocks].filter((candidate) => candidate.order >= insertionOrder).sort((a, b) => b.order - a.order)) {
          await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { order: block.order + 1 } });
        }
        blockId = `assistant-block-${action.id}`;
        const stableId = `assistant-draft-${action.id}`;
        await tx.studioDocumentBlock.create({
          data: {
            id: blockId,
            documentId: document.id,
            stableId,
            order: insertionOrder,
            body: text,
            projectionStatus: "private",
            isPrivate: true,
          },
        });
        const operation = await tx.studioDocumentOperation.create({
          data: {
            projectId: document.projectId,
            documentId: document.id,
            actorEmail,
            origin: "assistant",
            operationType: "assistant-draft-insert",
            beforeJson: toPrismaJson({ blockId: null, insertAfterBlockId }),
            afterJson: toPrismaJson({ blockId, stableId, body: text, order: insertionOrder }),
            payloadJson: toPrismaJson({ assistantActionId: action.id, proposalKind: action.kind }),
            reversible: true,
          },
          select: { id: true },
        });
        operationId = operation.id;
      }

      const receipt: AssistantDocumentApplyReceipt = {
        actionId: action.id,
        operationId,
        projectId: document.projectId,
        documentId: document.id,
        blockId,
        kind: isRewrite ? "rewrite" : "draft",
        text,
        insertAfterBlockId,
      };
      await tx.studioAssistantAction.update({ where: { id: action.id }, data: { status: "applied" } });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: action.status,
          newStatus: "applied",
          notes: JSON.stringify({ kind: "quipsly-assistant-document-apply-v1", actorEmail, receipt }),
        },
      });
      await tx.studioDocument.update({ where: { id: document.id }, data: { updatedAt: new Date() } });
      return { replay: false, receipt };
    });

    try {
      revalidatePath("/create");
    } catch (error) {
      console.error("Assistant edit persisted, but the writing route cache could not refresh.", error);
    }
    void syncBlocksToQuipslyNote(result.receipt.documentId).catch((error) => {
      console.error("Assistant edit persisted, but native-note projection sync failed.", error);
    });
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof AssistantMutationError) {
      return { ok: false, state: "rejected", code: error.code, error: error.message };
    }
    console.error("Assistant document apply failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The manuscript proposal could not be applied. No success was recorded; reload to verify the document before retrying.",
    };
  }
}

export async function undoAppliedAssistantDocumentEditAction(
  actionId: string,
): Promise<AssistantMutationResult<AssistantDocumentApplyReceipt>> {
  const prepared = await prepareAssistantMutation(actionId);
  if (prepared.error) return prepared.error;
  const { prisma, actorEmail } = prepared;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAssistantAction(tx, actionId);
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
        include: {
          session: true,
          ledgers: {
            where: { newStatus: { in: ["applied", "undone"] } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!action) throw new AssistantMutationError("ACTION_NOT_FOUND", "That assistant proposal no longer exists.");

      const applyLedger = action.ledgers.find((ledger) => ledger.newStatus === "applied");
      const receipt = parseAssistantReceipt<AssistantDocumentApplyReceipt>(applyLedger?.notes);
      if (!receipt || receipt.actionId !== action.id || receipt.documentId !== action.session.documentId) {
        throw new AssistantMutationError("INVALID_PAYLOAD", "The manuscript apply receipt is incomplete; nothing was changed.");
      }
      if (action.status === "undone" && action.ledgers.some((ledger) => ledger.newStatus === "undone")) {
        return { replay: true, receipt };
      }
      if (action.status !== "applied") {
        throw new AssistantMutationError("STALE_SOURCE", "This proposal has no applied manuscript change to undo.");
      }

      const operation = await tx.studioDocumentOperation.findFirst({
        where: {
          id: receipt.operationId,
          projectId: receipt.projectId,
          documentId: receipt.documentId,
          origin: "assistant",
          status: "applied",
          reversible: true,
          revertedAt: null,
        },
      });
      const operationPayload = assistantRecord(operation?.payloadJson);
      if (!operation || operationPayload.assistantActionId !== action.id) {
        throw new AssistantMutationError("STALE_SOURCE", "The reversible operation no longer matches this proposal; nothing was changed.");
      }

      const before = assistantRecord(operation.beforeJson);
      const after = assistantRecord(operation.afterJson);
      if (receipt.kind === "rewrite") {
        const priorBody = typeof before.body === "string" ? before.body : null;
        const appliedBody = typeof after.body === "string" ? after.body : null;
        const block = await tx.studioDocumentBlock.findFirst({
          where: { id: receipt.blockId, documentId: receipt.documentId },
          select: { id: true, body: true, stableId: true },
        });
        if (!block || priorBody === null || appliedBody === null || block.body !== appliedBody || block.stableId !== after.stableId) {
          throw new AssistantMutationError("STALE_SOURCE", "The manuscript changed after this rewrite was applied. Undo refused to overwrite the newer work.");
        }
        await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { body: priorBody } });
      } else if (receipt.kind === "draft") {
        const appliedBody = typeof after.body === "string" ? after.body : null;
        const block = await tx.studioDocumentBlock.findFirst({
          where: { id: receipt.blockId, documentId: receipt.documentId },
          select: { id: true, body: true, stableId: true, order: true },
        });
        if (!block || appliedBody === null || block.body !== appliedBody || block.stableId !== after.stableId) {
          throw new AssistantMutationError("STALE_SOURCE", "The inserted draft changed after it was applied. Undo refused to delete the newer work.");
        }
        await tx.studioDocumentBlock.delete({ where: { id: block.id } });
        await tx.studioDocumentBlock.updateMany({
          where: { documentId: receipt.documentId, order: { gt: block.order } },
          data: { order: { decrement: 1 } },
        });
      } else {
        throw new AssistantMutationError("INVALID_PAYLOAD", "The manuscript apply receipt has an unsupported operation.");
      }

      await tx.studioDocumentOperation.update({
        where: { id: operation.id },
        data: { status: "reverted", revertedAt: new Date(), actorEmail },
      });
      await tx.studioAssistantAction.update({ where: { id: action.id }, data: { status: "undone" } });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: "applied",
          newStatus: "undone",
          notes: JSON.stringify({ kind: "quipsly-assistant-document-undo-v1", actorEmail, receipt }),
        },
      });
      await tx.studioDocument.update({ where: { id: receipt.documentId }, data: { updatedAt: new Date() } });
      return { replay: false, receipt };
    });

    try {
      revalidatePath("/create");
    } catch (error) {
      console.error("Assistant edit undo persisted, but the writing route cache could not refresh.", error);
    }
    void syncBlocksToQuipslyNote(result.receipt.documentId).catch((error) => {
      console.error("Assistant edit undo persisted, but native-note projection sync failed.", error);
    });
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof AssistantMutationError) {
      return { ok: false, state: "rejected", code: error.code, error: error.message };
    }
    console.error("Assistant document undo failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The manuscript edit could not be undone. No success was recorded; reload to verify the document before retrying.",
    };
  }
}

export async function recordAssistantProposalDecisionAction(
  actionId: string,
  decision: "proposed" | "approved" | "rejected",
): Promise<AssistantMutationResult<AssistantDecisionReceipt>> {
  const prepared = await prepareAssistantMutation(actionId);
  if (prepared.error) return prepared.error;
  const { prisma, actorEmail } = prepared;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAssistantAction(tx, actionId);
      const action = await tx.studioAssistantAction.findUnique({ where: { id: actionId } });
      if (!action) throw new AssistantMutationError("ACTION_NOT_FOUND", "That assistant proposal no longer exists.");
      const allowedFrom: Record<typeof decision, string[]> = {
        approved: ["proposed"],
        rejected: ["proposed", "approved"],
        proposed: ["approved"],
      };
      if (action.status === decision) {
        return {
          replay: true,
          receipt: { actionId: action.id, previousStatus: action.status, status: decision },
        };
      }
      if (!allowedFrom[decision].includes(action.status)) {
        throw new AssistantMutationError("STALE_SOURCE", `This proposal is already ${action.status}; the ${decision} decision was not recorded.`);
      }

      const receipt: AssistantDecisionReceipt = {
        actionId: action.id,
        previousStatus: action.status,
        status: decision,
      };
      await tx.studioAssistantAction.update({ where: { id: action.id }, data: { status: decision } });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: action.status,
          newStatus: decision,
          notes: JSON.stringify({ kind: "quipsly-assistant-human-decision-v1", actorEmail, receipt }),
        },
      });
      return { replay: false, receipt };
    });
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof AssistantMutationError) {
      return { ok: false, state: "rejected", code: error.code, error: error.message };
    }
    console.error("Assistant proposal decision failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The review decision could not be recorded. The proposal remains unchanged.",
    };
  }
}

const ASSISTANT_ENTITY_TYPES = new Set(["CHARACTER", "SETTING", "SCENE", "RELATIONSHIP", "TIMELINE_EVENT", "THEME_MOTIF"]);

export async function commitAssistantEntityAction(
  actionId: string,
): Promise<AssistantMutationResult<AssistantEntityCommitReceipt>> {
  const prepared = await prepareAssistantMutation(actionId);
  if (prepared.error) return prepared.error;
  const { prisma, actorEmail } = prepared;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAssistantAction(tx, actionId);
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
        include: {
          session: true,
          ledgers: { where: { newStatus: "committed" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!action) throw new AssistantMutationError("ACTION_NOT_FOUND", "That assistant proposal no longer exists.");
      const priorReceipt = parseAssistantReceipt<AssistantEntityCommitReceipt>(action.ledgers[0]?.notes);
      if (action.status === "committed" && priorReceipt) return { replay: true, receipt: priorReceipt };
      if (!["proposed", "approved"].includes(action.status)) {
        throw new AssistantMutationError("STALE_SOURCE", "This Story Bible proposal has already been decided.");
      }

      const payload = assistantRecord(action.payloadJson);
      const name = assistantText(payload.name, 300);
      const type = assistantText(payload.type, 80).toUpperCase();
      const aliases = Array.isArray(payload.aliases)
        ? payload.aliases.map((value) => assistantText(value, 160)).filter(Boolean).slice(0, 40)
        : [];
      const attributes = assistantRecord(payload.attributes);
      const sourceExcerpt = assistantText(attributes.sourceExcerpt, 20_000);
      if (!name || !ASSISTANT_ENTITY_TYPES.has(type) || !sourceExcerpt) {
        throw new AssistantMutationError("INVALID_PAYLOAD", "A canonical Story Bible entity requires a supported type, name, and exact source excerpt.");
      }
      const sourceDocumentId = assistantText(payload.sourceDocumentId ?? attributes.sourceDocumentId, 160) || action.session.documentId || "";
      if (!action.session.documentId || sourceDocumentId !== action.session.documentId) {
        throw new AssistantMutationError("INVALID_PAYLOAD", "The entity proposal is not anchored to its authorized source document.");
      }
      const sourceDocument = await tx.studioDocument.findFirst({
        where: { id: sourceDocumentId, projectId: action.session.projectId },
        select: {
          id: true,
          blocks: {
            where: { archivedAt: null },
            select: { id: true, stableId: true, body: true },
          },
        },
      });
      if (!sourceDocument) {
        throw new AssistantMutationError("ACTION_NOT_FOUND", "The entity proposal's source document is unavailable.");
      }
      const requestedSourceBlockId = assistantText(payload.sourceBlockId ?? attributes.sourceBlockId, 160);
      const excerptMatches = sourceDocument.blocks.filter((block) => block.body.includes(sourceExcerpt));
      const sourceBlock = requestedSourceBlockId
        ? excerptMatches.find((block) => block.id === requestedSourceBlockId)
        : excerptMatches.length === 1
          ? excerptMatches[0]
          : null;
      if (!sourceBlock) {
        throw new AssistantMutationError(
          "STALE_SOURCE",
          excerptMatches.length > 1
            ? "That exact excerpt appears in more than one block. Review a proposal with one explicit source block before committing."
            : "The exact source excerpt is no longer present in the proposed block. Nothing was committed.",
        );
      }
      const canonicalAttributes = {
        ...attributes,
        sourceExcerpt,
        sourceDocumentId: sourceDocument.id,
        sourceBlockId: sourceBlock.id,
        sourceStableBlockId: sourceBlock.stableId,
        _source: "quipsly-assistant-reviewed",
        _assistantActionId: action.id,
        _assistantReviewedBy: actorEmail,
      };

      let entityId = "";
      let operation: AssistantEntityCommitReceipt["operation"] = "created";
      let before: Record<string, unknown> | null = null;
      if (action.kind === "PROPOSE_ENTITY") {
        const entity = await tx.storyEntity.create({
          data: {
            projectId: action.session.projectId,
            type: type as StoryEntityType,
            name,
            aliases,
            attributes: toPrismaJson(canonicalAttributes),
          },
          select: { id: true },
        });
        entityId = entity.id;
      } else if (action.kind === "PROPOSE_ENTITY_UPDATE") {
        entityId = assistantText(payload.entityId, 160);
        const entity = entityId
          ? await tx.storyEntity.findFirst({ where: { id: entityId, projectId: action.session.projectId } })
          : null;
        if (!entity) throw new AssistantMutationError("ACTION_NOT_FOUND", "The Story Bible entity to update is unavailable.");
        before = { name: entity.name, type: entity.type, aliases: entity.aliases, attributes: entity.attributes };
        operation = "updated";
        await tx.storyEntity.update({
          where: { id: entity.id },
          data: {
            name,
            type: type as StoryEntityType,
            aliases,
            attributes: toPrismaJson({ ...assistantRecord(entity.attributes), ...canonicalAttributes }),
          },
        });
      } else {
        throw new AssistantMutationError("UNSUPPORTED_ACTION", "Only reviewed entity proposals can commit to the Story Bible.");
      }

      const receipt: AssistantEntityCommitReceipt = {
        actionId: action.id,
        projectId: action.session.projectId,
        entityId,
        operation,
      };
      await tx.studioAssistantAction.update({ where: { id: action.id }, data: { status: "committed" } });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: action.status,
          newStatus: "committed",
          notes: JSON.stringify({ kind: "quipsly-assistant-entity-commit-v1", actorEmail, receipt, before }),
        },
      });
      return { replay: false, receipt };
    });
    try {
      revalidatePath("/create");
    } catch (error) {
      console.error("Story Bible entity committed, but the writing route cache could not refresh.", error);
    }
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof AssistantMutationError) {
      return { ok: false, state: "rejected", code: error.code, error: error.message };
    }
    console.error("Assistant Story Bible commit failed.", error);
    return { ok: false, state: "unavailable", code: "PERSISTENCE_UNAVAILABLE", error: "The Story Bible proposal was not committed. No success was recorded." };
  }
}

export async function undoCommittedAssistantEntityAction(
  actionId: string,
): Promise<AssistantMutationResult<AssistantEntityCommitReceipt>> {
  const prepared = await prepareAssistantMutation(actionId);
  if (prepared.error) return prepared.error;
  const { prisma, actorEmail } = prepared;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAssistantAction(tx, actionId);
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
        include: {
          session: true,
          ledgers: { where: { newStatus: "committed" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!action || action.status !== "committed") {
        throw new AssistantMutationError("STALE_SOURCE", "This proposal has no committed Story Bible change to undo.");
      }
      const ledgerPayload = action.ledgers[0]?.notes ? assistantRecord(JSON.parse(action.ledgers[0].notes)) : {};
      const receipt = assistantRecord(ledgerPayload.receipt) as AssistantEntityCommitReceipt;
      if (!receipt.entityId || receipt.projectId !== action.session.projectId) {
        throw new AssistantMutationError("INVALID_PAYLOAD", "The Story Bible commit receipt is incomplete; nothing was changed.");
      }

      if (receipt.operation === "created") {
        const entity = await tx.storyEntity.findFirst({ where: { id: receipt.entityId, projectId: receipt.projectId } });
        const attributes = assistantRecord(entity?.attributes);
        if (!entity || attributes._assistantActionId !== action.id) {
          throw new AssistantMutationError("STALE_SOURCE", "The committed entity changed ownership or provenance; it was not deleted.");
        }
        await tx.storyEntity.delete({ where: { id: entity.id } });
      } else if (receipt.operation === "updated") {
        const before = assistantRecord(ledgerPayload.before);
        const entity = await tx.storyEntity.findFirst({ where: { id: receipt.entityId, projectId: receipt.projectId } });
        const beforeType = assistantText(before.type, 80).toUpperCase();
        if (!entity || !assistantText(before.name, 300) || !ASSISTANT_ENTITY_TYPES.has(beforeType)) {
          throw new AssistantMutationError("STALE_SOURCE", "The prior Story Bible state cannot be restored safely; nothing was changed.");
        }
        await tx.storyEntity.update({
          where: { id: entity.id },
          data: {
            name: String(before.name),
            type: beforeType as StoryEntityType,
            aliases: Array.isArray(before.aliases) ? before.aliases.map(String) : [],
            attributes: toPrismaJson(assistantRecord(before.attributes)),
          },
        });
      } else {
        throw new AssistantMutationError("INVALID_PAYLOAD", "The Story Bible commit receipt has an unsupported operation.");
      }

      await tx.studioAssistantAction.update({ where: { id: action.id }, data: { status: "undone" } });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: "committed",
          newStatus: "undone",
          notes: JSON.stringify({ kind: "quipsly-assistant-entity-undo-v1", actorEmail, receipt }),
        },
      });
      return { replay: false, receipt };
    });
    try {
      revalidatePath("/create");
    } catch (error) {
      console.error("Story Bible undo committed, but the writing route cache could not refresh.", error);
    }
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof AssistantMutationError) {
      return { ok: false, state: "rejected", code: error.code, error: error.message };
    }
    console.error("Assistant Story Bible undo failed.", error);
    return { ok: false, state: "unavailable", code: "PERSISTENCE_UNAVAILABLE", error: "The Story Bible change could not be undone. No success was recorded." };
  }
}

export type NamedDocumentCheckpoint = {
  id: string;
  name: string;
  createdAt: string;
  actorEmail: string | null;
  snapshotSha256: string;
  blockCount: number;
  spanCount: number;
  citationCount: number;
};

export type DocumentSafetyActionResult =
  | {
      ok: true;
      state: "persisted";
      checkpoint?: NamedDocumentCheckpoint;
      checkpoints?: NamedDocumentCheckpoint[];
      bundleJson?: string;
      receipt?: {
        operationId: string;
        snapshotSha256: string;
        blockCount: number;
        spanCount: number;
        citationCount: number;
        restoredFrom: "checkpoint" | "portable-export";
      };
    }
  | {
      ok: false;
      state: "rejected" | "unavailable";
      code:
        | "AUTH_REQUIRED"
        | "ACCESS_NOT_VERIFIED"
        | "DOCUMENT_NOT_FOUND"
        | "INVALID_NAME"
        | "INVALID_EXPORT"
        | "IDENTITY_MISMATCH"
        | "CITATION_MISMATCH"
        | "STALE_CHECKPOINT"
        | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

class DocumentSafetyError extends Error {
  constructor(
    readonly code: "DOCUMENT_NOT_FOUND" | "INVALID_EXPORT" | "IDENTITY_MISMATCH" | "CITATION_MISMATCH" | "STALE_CHECKPOINT",
    message: string,
  ) {
    super(message);
    this.name = "DocumentSafetyError";
  }
}

function portableCheckpointSummary(operation: {
  id: string;
  actorEmail: string | null;
  createdAt: Date;
  payloadJson: unknown;
}): NamedDocumentCheckpoint | null {
  const payload = assistantRecord(operation.payloadJson);
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 120) : "";
  const snapshotSha256 = typeof payload.snapshotSha256 === "string" ? payload.snapshotSha256 : "";
  const blockCount = Number(payload.blockCount);
  const spanCount = Number(payload.spanCount);
  const citationCount = Number(payload.citationCount);
  if (!name || !/^[a-f0-9]{64}$/.test(snapshotSha256)
    || ![blockCount, spanCount, citationCount].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return null;
  }
  return {
    id: operation.id,
    name,
    createdAt: operation.createdAt.toISOString(),
    actorEmail: operation.actorEmail,
    snapshotSha256,
    blockCount,
    spanCount,
    citationCount,
  };
}

async function capturePortableDocumentSnapshot(tx: Prisma.TransactionClient, documentId: string): Promise<PortableDocumentSnapshot> {
  const document = await tx.studioDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      stableId: true,
      projectId: true,
      title: true,
      sourceLabel: true,
      sourcePath: true,
      projectionStatus: true,
      isPrivate: true,
      project: { select: { slug: true, name: true } },
      blocks: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          stableId: true,
          order: true,
          title: true,
          body: true,
          sourceLabel: true,
          sourcePath: true,
          externalId: true,
          projectionStatus: true,
          isPrivate: true,
          taggedSpans: {
            orderBy: [{ startOffset: "asc" }, { endOffset: "asc" }, { id: "asc" }],
            select: {
              id: true,
              startOffset: true,
              endOffset: true,
              selectedText: true,
              noteBody: true,
              tag: { select: { slug: true, label: true, category: true } },
            },
          },
          sourceAnnotationUses: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              annotationId: true,
              useKind: true,
              citationKey: true,
              quoteSnapshot: true,
              citationLabel: true,
              sourceJson: true,
              archivedAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!document) throw new DocumentSafetyError("DOCUMENT_NOT_FOUND", "Document not found.");

  return {
    document: {
      id: document.id,
      stableId: document.stableId,
      projectId: document.projectId,
      projectSlug: document.project.slug,
      projectName: document.project.name,
      title: document.title,
      sourceLabel: document.sourceLabel,
      sourcePath: document.sourcePath,
      projectionStatus: document.projectionStatus,
      isPrivate: document.isPrivate,
    },
    blocks: document.blocks.map((block) => ({
      id: block.id,
      stableId: block.stableId,
      order: block.order,
      title: block.title,
      body: block.body,
      sourceLabel: block.sourceLabel,
      sourcePath: block.sourcePath,
      externalId: block.externalId,
      projectionStatus: block.projectionStatus,
      isPrivate: block.isPrivate,
      spans: block.taggedSpans.map((span) => ({
        id: span.id,
        tagSlug: span.tag.slug,
        tagLabel: span.tag.label,
        tagCategory: span.tag.category,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        selectedText: span.selectedText,
        ...(span.noteBody ? { noteBody: span.noteBody } : {}),
      })),
      citations: block.sourceAnnotationUses.map((citation) => ({
        id: citation.id,
        annotationId: citation.annotationId,
        useKind: citation.useKind,
        citationKey: citation.citationKey,
        quoteSnapshot: citation.quoteSnapshot,
        citationLabel: citation.citationLabel,
        sourceJson: assistantRecord(citation.sourceJson),
        archivedAt: citation.archivedAt?.toISOString() ?? null,
        createdAt: citation.createdAt.toISOString(),
      })),
    })),
  };
}

function portableDocumentBundle(snapshot: PortableDocumentSnapshot, exportedAt = new Date()): PortableDocumentBundle {
  const spanCount = snapshot.blocks.reduce((total, block) => total + block.spans.length, 0);
  const citationCount = snapshot.blocks.reduce((total, block) => total + block.citations.length, 0);
  return {
    schemaVersion: DOCUMENT_EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    snapshot,
    integrity: {
      algorithm: "sha256",
      snapshotSha256: documentSha256(stableDocumentJson(snapshot)),
      blockCount: snapshot.blocks.length,
      spanCount,
      citationCount,
    },
  };
}

function documentSafetyFailure(error: unknown, context: string): DocumentSafetyActionResult {
  if (error instanceof DocumentSafetyError) {
    return { ok: false, state: "rejected", code: error.code, error: error.message };
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("do not have") || message === "Document not found.") {
    return { ok: false, state: "rejected", code: "ACCESS_NOT_VERIFIED", error: "Quipsly could not verify access to this document. Nothing was changed." };
  }
  console.error(context, error);
  return { ok: false, state: "unavailable", code: "PERSISTENCE_UNAVAILABLE", error: "The writing database is unavailable. Nothing was changed." };
}

export async function listNamedDocumentCheckpointsAction(documentId: string): Promise<DocumentSafetyActionResult> {
  if (!await getActorEmail()) return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in to view document checkpoints." };
  try {
    const prisma = getPrismaClient();
    await requireProjectAccessByDocumentId(prisma, documentId, "read");
    const operations = await prisma.studioDocumentOperation.findMany({
      where: { documentId, operationType: "document-named-checkpoint" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, actorEmail: true, createdAt: true, payloadJson: true },
    });
    return { ok: true, state: "persisted", checkpoints: operations.map(portableCheckpointSummary).filter((item): item is NamedDocumentCheckpoint => Boolean(item)) };
  } catch (error) {
    return documentSafetyFailure(error, "Document checkpoints could not be listed.");
  }
}

export async function createNamedDocumentCheckpointAction(documentId: string, rawName: string): Promise<DocumentSafetyActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in before saving a named checkpoint." };
  const name = String(rawName ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) {
    return { ok: false, state: "rejected", code: "INVALID_NAME", error: "Give this checkpoint a name between 1 and 120 characters." };
  }
  try {
    const prisma = getPrismaClient();
    await requireProjectAccessByDocumentId(prisma, documentId, "write");
    const operation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`;
      const bundle = portableDocumentBundle(await capturePortableDocumentSnapshot(tx, documentId));
      const created = await tx.studioDocumentOperation.create({
        data: {
          projectId: bundle.snapshot.document.projectId,
          documentId,
          actorEmail,
          origin: "human",
          operationType: "document-named-checkpoint",
          afterJson: toPrismaJson(bundle),
          payloadJson: toPrismaJson({
            name,
            schemaVersion: bundle.schemaVersion,
            snapshotSha256: bundle.integrity.snapshotSha256,
            blockCount: bundle.integrity.blockCount,
            spanCount: bundle.integrity.spanCount,
            citationCount: bundle.integrity.citationCount,
          }),
          reversible: false,
        },
        select: { id: true, actorEmail: true, createdAt: true, payloadJson: true },
      });
      return created;
    });
    const checkpoint = portableCheckpointSummary(operation);
    if (!checkpoint) throw new Error("Checkpoint receipt could not be read back.");
    revalidatePath("/create");
    return { ok: true, state: "persisted", checkpoint };
  } catch (error) {
    return documentSafetyFailure(error, "Named document checkpoint failed.");
  }
}

export async function exportPortableDocumentAction(documentId: string): Promise<DocumentSafetyActionResult> {
  if (!await getActorEmail()) return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in before exporting this document." };
  try {
    const prisma = getPrismaClient();
    await requireProjectAccessByDocumentId(prisma, documentId, "read");
    const bundle = await prisma.$transaction(async (tx) => portableDocumentBundle(await capturePortableDocumentSnapshot(tx, documentId)));
    return { ok: true, state: "persisted", bundleJson: JSON.stringify(bundle, null, 2) };
  } catch (error) {
    return documentSafetyFailure(error, "Portable document export failed.");
  }
}

async function restorePortableDocument(
  documentId: string,
  bundle: PortableDocumentBundle,
  actorEmail: string,
  restoredFrom: "checkpoint" | "portable-export",
  checkpointId?: string,
) {
  const prisma = getPrismaClient();
  await requireProjectAccessByDocumentId(prisma, documentId, "write");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`;
    const current = await capturePortableDocumentSnapshot(tx, documentId);
    const target = bundle.snapshot;
    if (target.document.id !== current.document.id || target.document.stableId !== current.document.stableId
      || target.document.projectId !== current.document.projectId || target.document.projectSlug !== current.document.projectSlug) {
      throw new DocumentSafetyError("IDENTITY_MISMATCH", "This export belongs to a different canonical document. Nothing was restored.");
    }

    const currentBundle = portableDocumentBundle(current);
    const allBlocks = await tx.studioDocumentBlock.findMany({
      where: { documentId },
      orderBy: { order: "asc" },
      select: { id: true, stableId: true, order: true },
    });
    const existingById = new Map(allBlocks.map((block) => [block.id, block]));
    const existingByStableId = new Map(allBlocks.map((block) => [block.stableId, block]));
    for (const block of target.blocks) {
      const stableCollision = existingByStableId.get(block.stableId);
      if (stableCollision && stableCollision.id !== block.id) {
        throw new DocumentSafetyError("IDENTITY_MISMATCH", `Stable block ${block.stableId} is attached to a different record. Nothing was restored.`);
      }
    }

    const targetCitationIds = target.blocks.flatMap((block) => block.citations.map((citation) => citation.id));
    if (targetCitationIds.length > 0) {
      const citations = await tx.studioSourceAnnotationUse.findMany({
        where: { id: { in: targetCitationIds } },
        select: { id: true, annotationId: true, documentId: true, blockId: true },
      });
      const citationById = new Map(citations.map((citation) => [citation.id, citation]));
      for (const block of target.blocks) {
        for (const expected of block.citations) {
          const actual = citationById.get(expected.id);
          if (!actual || actual.annotationId !== expected.annotationId || actual.documentId !== documentId || actual.blockId !== block.id) {
            throw new DocumentSafetyError("CITATION_MISMATCH", `Citation ${expected.citationLabel || expected.citationKey} is no longer anchored to its source and block. Nothing was restored.`);
          }
        }
      }
    }

    const tagSlugs = Array.from(new Set(target.blocks.flatMap((block) => block.spans.map((span) => span.tagSlug))));
    const tags = tagSlugs.length > 0
      ? await tx.studioTag.findMany({ where: { projectId: current.document.projectId, slug: { in: tagSlugs } }, select: { id: true, slug: true } })
      : [];
    const tagBySlug = new Map(tags.map((tag) => [tag.slug, tag.id]));
    const missingTag = tagSlugs.find((slug) => !tagBySlug.has(slug));
    if (missingTag) throw new DocumentSafetyError("IDENTITY_MISMATCH", `Tag ${missingTag} is unavailable in this Nest. Nothing was restored.`);

    const maximumOrder = Math.max(0, ...allBlocks.map((block) => block.order), ...target.blocks.map((block) => block.order));
    const temporaryBase = maximumOrder + allBlocks.length + target.blocks.length + 10;
    for (const [index, block] of allBlocks.entries()) {
      await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { order: temporaryBase + index } });
    }

    const targetIds = new Set(target.blocks.map((block) => block.id));
    for (const [index, block] of target.blocks.entries()) {
      if (existingById.has(block.id)) {
        await tx.studioDocumentBlock.update({
          where: { id: block.id },
          data: {
            title: block.title,
            body: block.body,
            sourceLabel: block.sourceLabel,
            sourcePath: block.sourcePath,
            externalId: block.externalId,
            projectionStatus: block.projectionStatus as StudioProjectionStatus,
            isPrivate: block.isPrivate,
            archivedAt: null,
            archivedByLabel: null,
          },
        });
      } else {
        await tx.studioDocumentBlock.create({
          data: {
            id: block.id,
            documentId,
            stableId: block.stableId,
            order: temporaryBase + allBlocks.length + index,
            title: block.title,
            body: block.body,
            sourceLabel: block.sourceLabel,
            sourcePath: block.sourcePath,
            externalId: block.externalId,
            projectionStatus: block.projectionStatus as StudioProjectionStatus,
            isPrivate: block.isPrivate,
          },
        });
      }
      await tx.studioTaggedSpan.deleteMany({ where: { blockId: block.id } });
      if (block.spans.length > 0) {
        await tx.studioTaggedSpan.createMany({
          data: block.spans.map((span) => ({
            id: span.id,
            documentId,
            blockId: block.id,
            tagId: tagBySlug.get(span.tagSlug)!,
            startOffset: span.startOffset,
            endOffset: span.endOffset,
            selectedText: span.selectedText,
            noteBody: span.noteBody ?? null,
            documentStableId: target.document.stableId,
            documentTitleSnapshot: target.document.title,
            blockStableId: block.stableId,
            blockTitleSnapshot: block.title,
            sourceLabel: block.sourceLabel,
            sourcePath: block.sourcePath,
            sourceExternalId: block.externalId,
            projectionStatus: block.projectionStatus as StudioProjectionStatus,
            isPrivate: block.isPrivate,
            createdByLabel: actorEmail,
          })),
        });
      }
    }

    for (const block of allBlocks) {
      if (!targetIds.has(block.id)) {
        await tx.studioDocumentBlock.update({
          where: { id: block.id },
          data: { archivedAt: new Date(), archivedByLabel: `restore:${restoredFrom}` },
        });
      }
    }
    for (const block of target.blocks) {
      await tx.studioDocumentBlock.update({ where: { id: block.id }, data: { order: block.order } });
    }
    await tx.studioDocument.update({
      where: { id: documentId },
      data: {
        title: target.document.title,
        sourceLabel: target.document.sourceLabel,
        sourcePath: target.document.sourcePath,
        projectionStatus: target.document.projectionStatus as StudioProjectionStatus,
        isPrivate: target.document.isPrivate,
        updatedAt: new Date(),
      },
    });
    const operation = await tx.studioDocumentOperation.create({
      data: {
        projectId: target.document.projectId,
        documentId,
        groupId: checkpointId ?? null,
        actorEmail,
        origin: restoredFrom === "portable-export" ? "import" : "human",
        operationType: restoredFrom === "portable-export" ? "document-portable-restore" : "document-checkpoint-restore",
        beforeJson: toPrismaJson(currentBundle),
        afterJson: toPrismaJson(bundle),
        payloadJson: toPrismaJson({
          restoredFrom,
          checkpointId: checkpointId ?? null,
          snapshotSha256: bundle.integrity.snapshotSha256,
          blockCount: bundle.integrity.blockCount,
          spanCount: bundle.integrity.spanCount,
          citationCount: bundle.integrity.citationCount,
        }),
        reversible: true,
      },
      select: { id: true },
    });
    return {
      operationId: operation.id,
      snapshotSha256: bundle.integrity.snapshotSha256,
      blockCount: bundle.integrity.blockCount,
      spanCount: bundle.integrity.spanCount,
      citationCount: bundle.integrity.citationCount,
      restoredFrom,
    } as const;
  });
}

export async function restoreNamedDocumentCheckpointAction(documentId: string, checkpointId: string): Promise<DocumentSafetyActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in before restoring a checkpoint." };
  try {
    const prisma = getPrismaClient();
    await requireProjectAccessByDocumentId(prisma, documentId, "write");
    const checkpoint = await prisma.studioDocumentOperation.findFirst({
      where: { id: checkpointId, documentId, operationType: "document-named-checkpoint" },
      select: { afterJson: true },
    });
    if (!checkpoint) throw new DocumentSafetyError("STALE_CHECKPOINT", "That checkpoint is unavailable. Nothing was restored.");
    const validated = validateDocumentBundle(checkpoint.afterJson);
    if (!validated.ok) throw new DocumentSafetyError("INVALID_EXPORT", validated.error);
    const receipt = await restorePortableDocument(documentId, validated.bundle, actorEmail, "checkpoint", checkpointId);
    revalidatePath("/create");
    void syncBlocksToQuipslyNote(documentId).catch((error) => console.error("Checkpoint restored, but native-note projection sync failed.", error));
    return { ok: true, state: "persisted", receipt };
  } catch (error) {
    return documentSafetyFailure(error, "Named document checkpoint restore failed.");
  }
}

export async function restorePortableDocumentAction(documentId: string, rawBundleJson: string): Promise<DocumentSafetyActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) return { ok: false, state: "rejected", code: "AUTH_REQUIRED", error: "Sign in before restoring an export." };
  if (typeof rawBundleJson !== "string" || Buffer.byteLength(rawBundleJson, "utf8") > 60 * 1024 * 1024) {
    return { ok: false, state: "rejected", code: "INVALID_EXPORT", error: "That writing export is too large or unreadable. Nothing was restored." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBundleJson);
  } catch {
    return { ok: false, state: "rejected", code: "INVALID_EXPORT", error: "Choose an intact Quipsly writing JSON export. Nothing was restored." };
  }
  const validated = validateDocumentBundle(parsed);
  if (!validated.ok) return { ok: false, state: "rejected", code: "INVALID_EXPORT", error: validated.error };
  try {
    const receipt = await restorePortableDocument(documentId, validated.bundle, actorEmail, "portable-export");
    revalidatePath("/create");
    void syncBlocksToQuipslyNote(documentId).catch((error) => console.error("Portable restore persisted, but native-note projection sync failed.", error));
    return { ok: true, state: "persisted", receipt };
  } catch (error) {
    return documentSafetyFailure(error, "Portable document restore failed.");
  }
}

export type DocumentReorderActionResult =
  | {
      ok: true;
      state: "persisted";
      operationId: string;
      blockCount: number;
    }
  | {
      ok: false;
      state: "unavailable" | "rejected";
      code: "AUTH_REQUIRED" | "ACCESS_NOT_VERIFIED" | "INVALID_REORDER" | "DOCUMENT_NOT_FOUND" | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

export type BlockCommentActionResult =
  | {
      ok: true;
      state: "persisted";
      commentId: string;
      operationId: string | null;
      reused: boolean;
    }
  | {
      ok: false;
      state: "unavailable" | "rejected";
      code: "AUTH_REQUIRED" | "INVALID_COMMENT" | "ACCESS_NOT_VERIFIED" | "COMMENT_CONFLICT" | "PERSISTENCE_UNAVAILABLE";
      error: string;
    };

class BlockCommentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockCommentConflictError";
  }
}

class DocumentReorderError extends Error {
  constructor(
    readonly code: "INVALID_REORDER" | "DOCUMENT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "DocumentReorderError";
  }
}

export async function reorderDocumentBlocksAction(
  documentId: string,
  blockIds: string[],
): Promise<DocumentReorderActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return {
      ok: false,
      state: "rejected",
      code: "AUTH_REQUIRED",
      error: "Sign in before reordering this document.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Document reorder could not open persistence.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The document database is unavailable. No block order was changed.",
    };
  }

  try {
    await requireProjectAccessByDocumentId(prisma, documentId, "write");
  } catch (error) {
    console.error("Document reorder could not verify write access.", error);
    const accessError = error instanceof Error ? error.message : "";
    const accessDenied = accessError.includes("do not have write access") || accessError === "Document not found.";
    return {
      ok: false,
      state: accessDenied ? "rejected" : "unavailable",
      code: "ACCESS_NOT_VERIFIED",
      error: accessDenied
        ? "Write access is required to reorder this document. No block order was changed."
        : "Quipsly could not verify write access. No block order was changed.",
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.studioDocument.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          projectId: true,
          blocks: {
            select: { id: true, order: true, archivedAt: true, externalId: true },
            orderBy: { order: "asc" },
          },
        },
      });

      if (!document) {
        throw new DocumentReorderError("DOCUMENT_NOT_FOUND", "Document not found.");
      }

      const requestedIds = blockIds.map((id) => String(id).trim()).filter(Boolean);
      const requestedIdSet = new Set(requestedIds);
      const activeBlocks = document.blocks.filter((block) => block.archivedAt === null);
      const activeIdSet = new Set(activeBlocks.map((block) => block.id));

      if (
        requestedIds.length > 10_000
        || requestedIdSet.size !== requestedIds.length
        || requestedIds.length !== activeBlocks.length
        || requestedIds.some((id) => !activeIdSet.has(id))
      ) {
        throw new DocumentReorderError(
          "INVALID_REORDER",
          "The reorder payload does not exactly match the document's active blocks.",
        );
      }

      for (const [index, block] of activeBlocks.entries()) {
        if (isImmutableTranscriptSourceExternalId(block.externalId) && requestedIds[index] !== block.id) {
          throw new DocumentReorderError(
            "INVALID_REORDER",
            "Transcript source evidence stays pinned in its canonical position.",
          );
        }
      }

      let requestedIndex = 0;
      const finalIds = document.blocks.map((block) => {
        if (block.archivedAt !== null) return block.id;
        const nextId = requestedIds[requestedIndex];
        requestedIndex += 1;
        return nextId;
      });

      const beforeOrder = document.blocks.map((block) => ({ id: block.id, order: block.order }));
      const afterOrder = finalIds.map((id, order) => ({ id, order }));
      const maximumOrder = document.blocks.reduce((maximum, block) => Math.max(maximum, block.order), 0);
      const temporaryBase = maximumOrder + document.blocks.length + 1;

      // The unique (documentId, order) constraint requires a collision-free
      // temporary range before assigning the final contiguous sequence.
      for (const [index, block] of document.blocks.entries()) {
        await tx.studioDocumentBlock.update({
          where: { id: block.id },
          data: { order: temporaryBase + index },
        });
      }

      for (const item of afterOrder) {
        await tx.studioDocumentBlock.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }

      await tx.studioDocument.update({
        where: { id: document.id },
        data: { updatedAt: new Date() },
      });

      const operation = await tx.studioDocumentOperation.create({
        data: {
          projectId: document.projectId,
          documentId: document.id,
          actorEmail,
          origin: "human",
          operationType: "reorder_blocks",
          beforeJson: toPrismaJson({ blocks: beforeOrder }),
          afterJson: toPrismaJson({ blocks: afterOrder }),
          payloadJson: toPrismaJson({ requestedBlockIds: requestedIds }),
          reversible: true,
        },
        select: { id: true },
      });

      return { operationId: operation.id, blockCount: activeBlocks.length };
    });

    revalidatePath("/create");
    void syncBlocksToQuipslyNote(documentId).catch((error) => {
      console.error("Document reorder persisted, but note projection sync failed.", error);
    });

    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof DocumentReorderError) {
      return {
        ok: false,
        state: "rejected",
        code: error.code,
        error: error.message,
      };
    }

    console.error("Document reorder transaction failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The block order could not be persisted. The editor restored the previous order.",
    };
  }
}

export async function addBlockComment(
  blockId: string,
  start: number,
  end: number,
  text: string,
  comment: string,
): Promise<BlockCommentActionResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return {
      ok: false,
      state: "rejected",
      code: "AUTH_REQUIRED",
      error: "Sign in before adding a note to this passage.",
    };
  }

  const startOffset = Math.trunc(start);
  const endOffset = Math.trunc(end);
  const selectedText = typeof text === "string" ? text : "";
  const noteBody = typeof comment === "string" ? comment.trim() : "";
  if (
    !blockId
    || !Number.isSafeInteger(startOffset)
    || !Number.isSafeInteger(endOffset)
    || startOffset < 0
    || endOffset <= startOffset
    || !selectedText
    || !noteBody
    || noteBody.length > 20_000
  ) {
    return {
      ok: false,
      state: "rejected",
      code: "INVALID_COMMENT",
      error: "Select an exact passage and write a note of 20,000 characters or fewer.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Writing note could not open persistence.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The writing database is unavailable. Your note was not saved.",
    };
  }

  try {
    await requireProjectAccessByBlockId(prisma, blockId, "write");
  } catch (error) {
    console.error("Writing note could not verify write access.", error);
    return {
      ok: false,
      state: "rejected",
      code: "ACCESS_NOT_VERIFIED",
      error: "Write access is required to add a note to this passage.",
    };
  }

  try {
    const block = await prisma.studioDocumentBlock.findUnique({
      where: { id: blockId },
      select: {
        id: true,
        stableId: true,
        title: true,
        body: true,
        sourceLabel: true,
        sourcePath: true,
        externalId: true,
        projectionStatus: true,
        isPrivate: true,
        document: {
          select: {
            id: true,
            stableId: true,
            title: true,
            projectId: true,
          },
        },
      },
    });
    if (!block || endOffset > block.body.length || block.body.slice(startOffset, endOffset) !== selectedText) {
      return {
        ok: false,
        state: "rejected",
        code: "INVALID_COMMENT",
        error: "The passage changed or the selection no longer matches. Select it again before saving.",
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const tag = await tx.studioTag.upsert({
        where: { projectId_slug: { projectId: block.document.projectId, slug: "comment" } },
        update: { label: "Comment", category: "review", isPrivate: true, isActive: true },
        create: {
          projectId: block.document.projectId,
          slug: "comment",
          label: "Comment",
          category: "review",
          isPrivate: true,
        },
        select: { id: true },
      });
      const existing = await tx.studioTaggedSpan.findUnique({
        where: {
          blockId_tagId_startOffset_endOffset: {
            blockId,
            tagId: tag.id,
            startOffset,
            endOffset,
          },
        },
        select: { id: true, selectedText: true, noteBody: true },
      });
      if (existing) {
        if (existing.selectedText === selectedText && existing.noteBody === noteBody) {
          return { commentId: existing.id, operationId: null, reused: true };
        }
        throw new BlockCommentConflictError(
          "A different note already exists on this exact passage. Remove it before replacing it.",
        );
      }

      const saved = await tx.studioTaggedSpan.create({
        data: {
          documentId: block.document.id,
          blockId,
          tagId: tag.id,
          startOffset,
          endOffset,
          selectedText,
          noteBody,
          documentStableId: block.document.stableId,
          documentTitleSnapshot: block.document.title,
          blockStableId: block.stableId,
          blockTitleSnapshot: block.title,
          sourceLabel: block.sourceLabel,
          sourcePath: block.sourcePath,
          sourceExternalId: block.externalId,
          projectionStatus: block.projectionStatus,
          isPrivate: true,
          createdByLabel: actorEmail,
        },
        select: { id: true },
      });
      const operation = await tx.studioDocumentOperation.create({
        data: {
          projectId: block.document.projectId,
          documentId: block.document.id,
          actorEmail,
          origin: "human",
          operationType: "document-passage-note-add",
          status: "applied",
          beforeJson: toPrismaJson({ blockId, commentId: null }),
          afterJson: toPrismaJson({
            blockId,
            commentId: saved.id,
            startOffset,
            endOffset,
            selectedText,
            noteBody,
          }),
          payloadJson: toPrismaJson({ blockId, commentId: saved.id, tagSlug: "comment" }),
          reversible: true,
        },
        select: { id: true },
      });
      await tx.studioDocument.update({
        where: { id: block.document.id },
        data: { updatedAt: new Date() },
      });
      return { commentId: saved.id, operationId: operation.id, reused: false };
    });

    revalidatePath("/create");
    return { ok: true, state: "persisted", ...result };
  } catch (error) {
    if (error instanceof BlockCommentConflictError) {
      return {
        ok: false,
        state: "rejected",
        code: "COMMENT_CONFLICT",
        error: error.message,
      };
    }
    console.error("Writing note persistence failed.", error);
    return {
      ok: false,
      state: "unavailable",
      code: "PERSISTENCE_UNAVAILABLE",
      error: "The note could not be saved. The selected passage was not changed.",
    };
  }
}
export async function updateCandidatePacketAction(candidateId: string, packet: any): Promise<{ ok: boolean, error?: string }> {
  void candidateId;
  void packet;
  return { ok: false, error: LEGACY_PUBLISHING_EXECUTION_ERROR };
}

export async function testPublishCandidateAction(candidateId: string): Promise<{ ok: boolean, validationResults?: any, payloads?: any, error?: string }> {
  void candidateId;
  return { ok: false, error: LEGACY_PUBLISHING_EXECUTION_ERROR };
}

export async function retractEpisodeCandidateAction(candidateId: string, destinations: string[]): Promise<{ ok: boolean, message?: string, error?: string }> {
  void candidateId;
  void destinations;
  return { ok: false, error: LEGACY_PUBLISHING_EXECUTION_ERROR };
}

export type ResearchIndexRefreshResult =
  | {
      success: true;
      state: "persisted";
      result: { syncedBlocks: number; syncedQuotes: number; model: string };
    }
  | {
      success: false;
      state: "rejected" | "unavailable";
      code: "AUTH_REQUIRED" | "ACCESS_NOT_VERIFIED" | "PROVIDER_UNAVAILABLE" | "INDEX_REFRESH_FAILED";
      error: string;
    };

export async function syncEmbeddingsAction(projectId: string): Promise<ResearchIndexRefreshResult> {
  const actorEmail = await getActorEmail();
  if (!actorEmail) {
    return {
      success: false,
      state: "rejected",
      code: "AUTH_REQUIRED",
      error: "Sign in before refreshing this Nest's AI research index.",
    };
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
    await requireProjectAccessByProjectId(prisma, projectId, "write");
  } catch (error) {
    console.error("Research index refresh could not verify write access.", error);
    return {
      success: false,
      state: "rejected",
      code: "ACCESS_NOT_VERIFIED",
      error: "Write access to this Nest is required. The existing research index was not changed.",
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      state: "unavailable",
      code: "PROVIDER_UNAVAILABLE",
      error: "AI research indexing is not configured. The existing index was not changed.",
    };
  }

  try {
    const result = await syncProjectEmbeddings(projectId);
    return {
      success: true,
      state: "persisted",
      result: { ...result, model: QUIPSLY_EMBEDDING_MODEL },
    };
  } catch (error) {
    console.error("Research index refresh failed.", error);
    return {
      success: false,
      state: "unavailable",
      code: "INDEX_REFRESH_FAILED",
      error: "The AI research index could not be refreshed. The previous index remains available.",
    };
  }
}
