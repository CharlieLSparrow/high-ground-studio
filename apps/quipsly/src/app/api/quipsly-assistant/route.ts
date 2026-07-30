import { GoogleGenAI, Schema, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";
import {
  prepareRetrievalQuery,
  QUIPSLY_EMBEDDING_DIMENSIONS,
  QUIPSLY_EMBEDDING_MODEL,
} from "@/lib/retrieval/embeddings";
import {
  createOutputCapabilityPlan,
  createOutputPacketSkeleton,
  getOutputDefinition,
  listOutputsForNestKind,
} from "@high-ground/quipsly-domain/output-catalog";

type AssistantBlockContext = {
  id?: string;
  text?: string;
  tags?: string[];
};

type AssistantBoundaryContext = {
  id?: string;
  label?: string;
  kind?: string;
};

type AssistantRequestBody = {
  sessionId?: string;
  message?: string;
  projectSlug?: string;
  documentId?: string;
  documentTitle?: string;
  activeBoundary?: AssistantBoundaryContext | null;
  activeViewName?: string;
  visibleBlocks?: AssistantBlockContext[];
  recentTags?: string[];
  projectDocuments?: { id: string; title: string; sourceLabel?: string | null }[];
};

type NormalizedToolIntent = {
  kind: string;
  label: string;
  explanation: string;
  riskLevel: "low" | "medium" | "high";
  payload: Record<string, unknown>;
};

const assistantResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    assistantMessage: {
      type: Type.STRING,
      description: "Warm, practical response to the user. Do not write prose for the manuscript unless explicitly asked for a research note draft.",
    },
    suggestions: {
      type: Type.ARRAY,
      description: "Short research, organization, or review suggestions.",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ["title", "detail", "confidence"],
      },
    },
    toolIntents: {
      type: Type.ARRAY,
      description: "Safe proposed tool actions. These are proposals only and must be approved by the human before any write occurs.",
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            description: "One of suggest-tags, find-related-blocks, create-research-packet-note, summarize-selected-block, propose-output-plan, PROPOSE_ENTITY, PROPOSE_ENTITY_UPDATE, PROPOSE_DRAFT, PROPOSE_REWRITE, CHECK_CONTINUITY, PROPOSE_CONTINUITY_FIX.",
          },
          label: { type: Type.STRING },
          explanation: {
            type: Type.STRING,
            description: "A clear 'why this suggestion?' explanation detailing the reasoning behind this proposed action.",
          },
          riskLevel: {
            type: Type.STRING,
            description: "low, medium, or high. Use high for any proposed content mutation.",
          },
          payload: {
            type: Type.OBJECT,
            description: "Small JSON payload describing the proposed action.",
            properties: {},
          },
        },
        required: ["kind", "label", "explanation", "riskLevel", "payload"],
      },
    },
  },
  required: ["assistantMessage", "suggestions", "toolIntents"],
};

const SAFE_TOOL_KINDS = new Set([
  "suggest-tags",
  "find-related-blocks",
  "create-research-packet-note",
  "summarize-selected-block",
  "propose-output-plan",
  "find-examples",
  "search-quotes",
  "PROPOSE_ENTITY",
  "PROPOSE_ENTITY_UPDATE",
  "PROPOSE_DRAFT",
  "PROPOSE_REWRITE",
  "CHECK_CONTINUITY",
  "PROPOSE_CONTINUITY_FIX",
  "open-document",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanTags(value: unknown) {
  return Array.isArray(value)
    ? value.map((tag) => cleanText(tag, 48)).filter(Boolean).slice(0, 16)
    : [];
}

function cleanBlocks(value: unknown): AssistantBlockContext[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 14).map((raw) => {
    const block = asRecord(raw);
    return {
      id: cleanText(block.id, 80),
      text: cleanText(block.text, 900),
      tags: cleanTags(block.tags),
    };
  }).filter((block) => block.id || block.text);
}

function cleanBoundary(value: unknown): AssistantBoundaryContext | null {
  const boundary = asRecord(value);
  const label = cleanText(boundary.label, 140);
  const kind = cleanText(boundary.kind, 32);
  if (!label && !kind) return null;
  return {
    id: cleanText(boundary.id, 80),
    label,
    kind,
  };
}

function cleanDocuments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map(raw => {
    const doc = asRecord(raw);
    return {
      id: cleanText(doc.id, 80),
      title: cleanText(doc.title, 180),
      sourceLabel: cleanText(doc.sourceLabel, 80) || null,
    };
  }).filter(doc => doc.id && doc.title);
}

function inferOutputCandidates(context: {
  message: string;
  activeBoundary: AssistantBoundaryContext | null;
  recentTags: string[];
  visibleBlocks: AssistantBlockContext[];
}) {
  const haystack = [
    context.message,
    context.activeBoundary?.label ?? "",
    context.activeBoundary?.kind ?? "",
    context.recentTags.join(" "),
    context.visibleBlocks.slice(0, 5).map((block) => `${block.text} ${(block.tags ?? []).join(" ")}`).join(" "),
  ].join(" ").toLowerCase();

  const explicitOutputIds = [
    haystack.includes("youtube") || haystack.includes("video") ? "youtube-video-package" : "",
    haystack.includes("podcast") || haystack.includes("audio") || haystack.includes("rss") ? "podcast-rss-episode" : "",
    haystack.includes("quote") || haystack.includes("quiplore") ? "quote-feed" : "",
    haystack.includes("course") || haystack.includes("scorm") || haystack.includes("lesson") ? "scorm-course" : "",
    haystack.includes("gallery") || haystack.includes("photo") || haystack.includes("client") ? "photo-gallery-review" : "",
    haystack.includes("patreon") || haystack.includes("supporter") ? "patreon-post" : "",
    haystack.includes("book") || haystack.includes("kindle") ? "book-export" : "",
    haystack.includes("episode") || context.activeBoundary?.kind === "episode" ? "hgo-episode-page" : "",
  ].filter(Boolean);

  const fallbackOutputs = listOutputsForNestKind("writing").map((output) => output.id);
  return Array.from(new Set([...explicitOutputIds, ...fallbackOutputs])).slice(0, 3)
    .map((outputId) => getOutputDefinition(outputId))
    .filter(Boolean);
}

function localAssistantFallback(context: Required<Pick<AssistantRequestBody, "message" | "projectSlug" | "documentTitle" | "activeViewName">> & {
  activeBoundary: AssistantBoundaryContext | null;
  visibleBlocks: AssistantBlockContext[];
  recentTags: string[];
}) {
  const boundaryLabel = context.activeBoundary?.label;
  const hasStructure = context.visibleBlocks.some((block) =>
    (block.tags ?? []).includes("chapter") || (block.tags ?? []).includes("episode")
  );
  const outputCandidates = inferOutputCandidates(context);
  const primaryOutput = outputCandidates[0];
  const isOutputContext = !!primaryOutput;

  return {
    source: "local-fallback",
    assistantMessage: isOutputContext
      ? "I can help prepare output packets, draft outlines, or organize the project. Ask me to draft a new scene, find related material, suggest tags, or summarize a selected block."
      : "I can help draft, rewrite, or organize this project. Ask me to draft a new scene, find related material, suggest tags, or summarize a selected block.",
    suggestions: [
      {
        title: hasStructure ? "Use the outline as the spine" : "Start with structure",
        detail: hasStructure
          ? "Chapter and Episode tags are already present, so the safest next move is to use those boundaries for retrieval and production context."
          : "Create heading blocks and tag them Chapter or Episode so Quipsly can reason from the manuscript spine.",
        confidence: 0.78,
      },
      {
        title: "Keep authorship human",
        detail: "Quipsly should collect source material, compare examples, and propose organization changes, then wait for approval before touching the document.",
        confidence: 0.92,
      },
      primaryOutput
        ? {
            title: `Possible output: ${primaryOutput.title}`,
            detail: `This context may be able to project into ${primaryOutput.title}. Review the output plan before building or publishing any packet.`,
            confidence: 0.74,
          }
        : null,
    ].filter(Boolean),
    toolIntents: [
      {
        kind: "find-examples",
        label: boundaryLabel ? `Find related material for ${boundaryLabel}` : "Find related manuscript material",
        explanation: "Why this suggestion? Searching the visible manuscript context for blocks that appear related to the current writing focus helps build consistent lore.",
        riskLevel: "low",
        payload: {
          query: context.message,
          projectSlug: context.projectSlug,
          documentTitle: context.documentTitle,
          activeBoundary: context.activeBoundary,
          visibleBlockIds: context.visibleBlocks.map((block) => block.id).filter(Boolean).slice(0, 12),
        },
      },
      {
        kind: "suggest-tags",
        label: "Suggest Chapter/Episode Tags",
        explanation: "Why this suggestion? Tagging blocks with chapter or episode structures helps Quipsly accurately organize your manuscript.",
        riskLevel: "low",
        payload: {
          recentTags: context.recentTags,
        },
      },
      ...(primaryOutput ? [
        {
          kind: "propose-output-plan",
          label: `Review capability definition: ${primaryOutput.title}`,
          explanation: "Why this suggestion? Capability definitions map how the current writing context could become a reviewed packet without claiming that the packet or publication already exists.",
          riskLevel: "low" as const,
          payload: {
            outputId: primaryOutput.id,
            title: primaryOutput.title,
            href: `/outputs/${primaryOutput.id}`,
            capabilityPlan: createOutputCapabilityPlan(primaryOutput),
            packetSkeleton: createOutputPacketSkeleton(primaryOutput),
          },
        },
      ] : []),
    ],
  };
}

function normalizeAssistantPayload(raw: unknown) {
  const payload = asRecord(raw);
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  const toolIntents = Array.isArray(payload.toolIntents) ? payload.toolIntents : [];

  return {
    source: "gemini",
    assistantMessage: cleanText(payload.assistantMessage, 1400) || "I found a few safe ways to help organize this project.",
    suggestions: suggestions.slice(0, 6).map((item) => {
      const record = asRecord(item);
      return {
        title: cleanText(record.title, 120) || "Suggestion",
        detail: cleanText(record.detail, 700),
        confidence: Math.max(0, Math.min(1, Number(record.confidence ?? 0.5))),
      };
    }).filter((item) => item.detail),
    toolIntents: toolIntents.slice(0, 6).map((item) => {
      const record = asRecord(item);
      const kind = cleanText(record.kind, 80);
      if (!SAFE_TOOL_KINDS.has(kind)) return null;
      const riskLevel = cleanText(record.riskLevel, 16).toLowerCase();
      const normalizedRiskLevel: NormalizedToolIntent["riskLevel"] =
        riskLevel === "medium" || riskLevel === "high" ? riskLevel : "low";
      let payload = asRecord(record.payload);
      if (kind === "propose-output-plan") {
        const outputId = cleanText(payload.outputId ?? payload.id, 96);
        const output = getOutputDefinition(outputId);
        if (output) {
          payload = {
            ...payload,
            outputId: output.id,
            title: output.title,
            href: `/outputs/${output.id}`,
            capabilityPlan: createOutputCapabilityPlan(output),
            packetSkeleton: createOutputPacketSkeleton(output),
          };
        }
      }
      return {
        kind,
        label: cleanText(record.label, 120) || kind,
        explanation: cleanText(record.explanation, 700),
        riskLevel: normalizedRiskLevel,
        payload,
      };
    }).filter((item): item is NormalizedToolIntent => item !== null),
  };
}

async function persistAssistantToolIntents(
  prisma: ReturnType<typeof getPrismaClient>,
  sessionId: string,
  toolIntents: NormalizedToolIntent[],
) {
  if (toolIntents.length === 0) return toolIntents;
  const savedActions = await prisma.$transaction(async (tx) => {
    const saved: Array<{ id: string; sourceIndex: number }> = [];
    for (const [sourceIndex, intent] of toolIntents.entries()) {
      const action = await tx.studioAssistantAction.create({
        data: {
          sessionId,
          kind: intent.kind,
          label: intent.label,
          explanation: intent.explanation,
          riskLevel: intent.riskLevel.toUpperCase(),
          payloadJson: intent.payload as any,
          status: "proposed",
        },
        select: { id: true },
      });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: null,
          newStatus: "proposed",
          notes: JSON.stringify({
            kind: "quipsly-assistant-proposal-created-v1",
            proposalKind: intent.kind,
          }),
        },
      });
      saved.push({ id: action.id, sourceIndex });
    }
    return saved;
  });
  const persistedIds = new Map(savedActions.map((saved) => [saved.sourceIndex, saved.id]));
  return toolIntents.map((intent, sourceIndex) => ({
    ...intent,
    id: persistedIds.get(sourceIndex),
  }));
}

function anchorEntityProposalSources(
  toolIntents: NormalizedToolIntent[],
  documentId: string,
  visibleBlocks: AssistantBlockContext[],
) {
  return toolIntents.map((intent) => {
    if (intent.kind !== "PROPOSE_ENTITY" && intent.kind !== "PROPOSE_ENTITY_UPDATE") return intent;
    const attributes = asRecord(intent.payload.attributes);
    const sourceExcerpt = typeof attributes.sourceExcerpt === "string" ? attributes.sourceExcerpt.trim() : "";
    if (!sourceExcerpt) return intent;
    const matches = visibleBlocks.filter((block) => block.id && typeof block.text === "string" && block.text.includes(sourceExcerpt));
    if (matches.length !== 1) return intent;
    return {
      ...intent,
      payload: {
        ...intent.payload,
        sourceDocumentId: documentId,
        sourceBlockId: matches[0].id,
        attributes: {
          ...attributes,
          sourceExcerpt,
          sourceDocumentId: documentId,
          sourceBlockId: matches[0].id,
        },
      },
    };
  });
}

export async function GET(request: Request) {
  try {
    const actorSession = await auth();
    const actorUserId = actorSession?.user?.id;
    if (!actorUserId) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const projectSlug = searchParams.get("projectSlug");
    const documentId = searchParams.get("documentId");

    if (!projectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: false, error: "Quipsly cannot verify Nest access while its database is unavailable." }, { status: 503 });
    }

    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug }
    });

    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    // Tenancy access check
    try {
      await requireProjectAccess(project.slug, "read");
    } catch (accessErr: any) {
      const message = accessErr.message || "Forbidden";
      return NextResponse.json({ ok: false, error: message }, { status: message.startsWith("UNAUTHORIZED") ? 401 : 403 });
    }

    if (documentId) {
      const visibleDocument = await prisma.studioDocument.findFirst({
        where: {
          id: documentId,
          projectId: project.id,
          ...personalWritingDocumentVisibilityWhere(actorUserId),
        },
        select: { id: true },
      });
      if (!visibleDocument) {
        return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
      }
    }

    const session = await (prisma as any).studioAssistantSession.findFirst({
      where: {
        projectId: project.id,
        documentId: documentId || null,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "desc" }
    });

    if (!session) {
      return NextResponse.json({ ok: true, session: null });
    }

    let actions = [];
    if (process.env.DATABASE_URL && session) {
      const dbActions = await (prisma as any).studioAssistantAction.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      actions = dbActions.map((dbAction: any) => ({
        id: dbAction.id,
        kind: dbAction.kind,
        label: dbAction.label,
        explanation: dbAction.explanation,
        status: dbAction.status,
        payload: dbAction.payloadJson,
        createdAt: dbAction.createdAt,
      }));
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      messages: [],
      actions,
    });
  } catch (error) {
    console.error("[quipsly-assistant-get] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to retrieve the assistant session safely." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const actorSession = await auth();
    const actorUserId = actorSession?.user?.id;
    if (!actorUserId) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const body = await request.json() as AssistantRequestBody;
    let context = {
      sessionId: body.sessionId,
      message: cleanText(body.message, 1600),
      projectSlug: cleanText(body.projectSlug, 120) || "unknown-project",
      documentId: cleanText(body.documentId, 120),
      documentTitle: cleanText(body.documentTitle, 180) || "Untitled document",
      activeBoundary: cleanBoundary(body.activeBoundary),
      activeViewName: cleanText(body.activeViewName, 120) || "Everything Mode",
      visibleBlocks: cleanBlocks(body.visibleBlocks),
      recentTags: cleanTags(body.recentTags),
      projectDocuments: cleanDocuments(body.projectDocuments),
    };

    if (!context.message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        ok: false,
        error: "Quipsly cannot verify Nest access while its database is unavailable. No provider request was sent.",
      }, { status: 503 });
    }

    const prisma = getPrismaClient();
    const project = await prisma.studioProject.findFirst({
      where: { slug: context.projectSlug },
      select: { id: true, slug: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: "Nest not found. No provider request was sent." }, { status: 404 });
    }
    try {
      await requireProjectAccess(project.slug, "read");
    } catch (accessErr) {
      const message = accessErr instanceof Error ? accessErr.message : "Forbidden";
      return NextResponse.json({ ok: false, error: message }, { status: message.startsWith("UNAUTHORIZED") ? 401 : 403 });
    }

    const projectDocuments = await prisma.studioDocument.findMany({
      where: {
        projectId: project.id,
        ...personalWritingDocumentVisibilityWhere(actorUserId),
      },
      select: { id: true, title: true, sourceLabel: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    if (context.documentId) {
      const document = await prisma.studioDocument.findFirst({
        where: {
          id: context.documentId,
          projectId: project.id,
          ...personalWritingDocumentVisibilityWhere(actorUserId),
        },
        select: {
          id: true,
          title: true,
          blocks: {
            where: { archivedAt: null },
            select: { id: true, body: true },
            orderBy: { order: "asc" },
          },
        },
      });
      if (!document) {
        return NextResponse.json({ ok: false, error: "The selected document is not available in this Nest. No provider request was sent." }, { status: 404 });
      }
      const canonicalBlocks = new Map(document.blocks.map((block) => [block.id, block.body]));
      context = {
        ...context,
        documentTitle: document.title,
        visibleBlocks: context.visibleBlocks.flatMap((block) => {
          const id = block.id || "";
          const canonicalText = canonicalBlocks.get(id);
          return canonicalText === undefined ? [] : [{ ...block, id, text: canonicalText.slice(0, 900) }];
        }),
        projectDocuments,
      };
    } else {
      context = { ...context, visibleBlocks: [], projectDocuments };
    }

    let sessionId = context.sessionId;
    if (sessionId) {
      const requestedSession = await prisma.studioAssistantSession.findFirst({
        where: {
          id: sessionId,
          projectId: project.id,
          documentId: context.documentId || null,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!requestedSession) {
        return NextResponse.json({ ok: false, error: "That assistant session does not belong to this Nest and document. No provider request was sent." }, { status: 409 });
      }
    } else {
      const activeSession = await prisma.studioAssistantSession.findFirst({
        where: { projectId: project.id, documentId: context.documentId || null, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      } else {
        const newSession = await prisma.studioAssistantSession.create({
          data: { projectId: project.id, documentId: context.documentId || null, status: "ACTIVE" },
          select: { id: true },
        });
        sessionId = newSession.id;
      }
    }

    const providerDisabled = process.env.QUIPSLY_DISABLE_AI_PROVIDER === "true";
    const apiKey = providerDisabled ? undefined : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const fallback = localAssistantFallback(context);
        const normalizedFallback = normalizeAssistantPayload(fallback);
        const toolIntents = await persistAssistantToolIntents(prisma, sessionId!, normalizedFallback.toolIntents);
        return NextResponse.json({
          ok: true,
          sessionId,
          ...normalizedFallback,
          source: "local-fallback",
          toolIntents,
          warning: providerDisabled
            ? "AI provider access is disabled for this environment, so Quipsly used local fallback guidance. Its review actions still have durable ledger receipts."
            : "GEMINI_API_KEY is not configured, so Quipsly used local fallback guidance. Its review actions still have durable ledger receipts.",
        });
      } catch (dbError) {
        console.error("[quipsly-assistant] Failed to persist local fallback actions:", dbError);
        return NextResponse.json({
          ok: false,
          error: "Quipsly prepared local guidance but could not record its action and ledger receipts atomically. No actionable proposal was returned.",
        }, { status: 503 });
      }
    }

    const ai = new GoogleGenAI({ apiKey });
    let ragContextChunks: Array<{ sourceOrigin: string; sourceId: string; contentSnapshot: string }> = [];
    let ragWarning: string | undefined;
    try {
      const embeddingResponse = await ai.models.embedContent({
        model: QUIPSLY_EMBEDDING_MODEL,
        contents: prepareRetrievalQuery(context.message),
        config: { outputDimensionality: QUIPSLY_EMBEDDING_DIMENSIONS },
      });
      const embeddingVector = embeddingResponse.embeddings?.[0]?.values;

      if (
        embeddingVector?.length === QUIPSLY_EMBEDDING_DIMENSIONS
        && embeddingVector.every(Number.isFinite)
        && embeddingVector.some((value) => value !== 0)
      ) {
        const vectorString = `[${embeddingVector.join(",")}]`;
        const relevantChunks = await prisma.$queryRaw<Array<{ sourceOrigin: string; sourceId: string; contentSnapshot: string }>>`
          SELECT "sourceOrigin", "sourceId", "contentSnapshot"
          FROM "RetrievalEmbedding"
          WHERE "projectId" = ${project.id}
            AND "sourceOrigin" IN ('studio-document-block', 'quipsly-lore-quote')
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorString}::vector
          LIMIT 5;
        `;
        ragContextChunks = relevantChunks;
        if (ragContextChunks.length === 0) {
          ragWarning = "No semantic Nest matches were found. This response used only the authorized current document context.";
        }
      } else {
        ragWarning = "Semantic Nest retrieval returned an invalid vector. This response used only the authorized current document context.";
      }
    } catch (ragError) {
      console.error("[quipsly-assistant] RAG pipeline error:", ragError);
      ragWarning = "Semantic Nest retrieval was unavailable. This response used only the authorized current document context.";
    }

    const isScanRequest = context.message.startsWith("SCAN_SECTION_FOR_ENTITIES:");
    const prompt = [
      "You are a Quipsly: a creative research and organization assistant for writers, authors, academics, podcasters, and creators.",
      "You prioritize empowering human writers by gathering sources, checking continuity, and organizing lore.",
      "However, you ARE allowed to act as a co-writer or ghostwriter when requested. You can draft rough scenes or propose full rewrites.",
      "CRITICAL: You must NEVER silently mutate the manuscript. All drafts and rewrites must be submitted safely as PROPOSE_DRAFT or PROPOSE_REWRITE tool intents for the user to review.",
      "Never claim you changed the manuscript yourself. You can only propose tool intents.",
      "",
      "Safe tool kinds:",
      "- suggest-tags (Only suggest Chapter/Episode tags to organize structure)",
      "- summarize-selected-block (Summarize a selected block as a preview)",
      "- find-related-blocks (Find related visible blocks)",
      "- create-research-packet-note (Create a draft research packet preview)",
      "- propose-output-plan (Suggest a non-mutating output readiness plan using the output catalog)",
      "- PROPOSE_ENTITY (Propose creating a new entity in the Story Bible/Study Corpus)",
      "- PROPOSE_ENTITY_UPDATE (Propose updating an existing entity's attributes in the Story Bible/Study Corpus)",
      "- PROPOSE_DRAFT (Propose a rough draft of a new scene or block. Must include 'draftText' in payload.)",
      "- PROPOSE_REWRITE (Propose a rewrite or alternate version of an existing block. Must include 'blockId', 'originalText', and 'rewriteText' in payload.)",
      "- CHECK_CONTINUITY (Flag a continuity error or inconsistency based on the Story Bible. Must include 'blockId', 'issueDescription', and 'violatingExcerpt' in payload.)",
      "- PROPOSE_CONTINUITY_FIX (Propose a rewrite to fix a continuity error. Must include 'blockId', 'originalText', 'rewriteText', and 'issueDescription' in payload.)",
      "- open-document (Suggest that the user open a different document in the project. Must include 'documentId' and 'documentTitle' in the payload.)",
      "",
      "IMPORTANT NEST CONTEXT: You are inside a multi-document Nest. You can see the 'projectDocuments' list in your context. You can suggest the user review or open other documents in the Nest if they are relevant to their request.",
      "",
      isScanRequest
        ? "The user has explicitly requested to scan the current section and extract entities. You must analyze the visible text block context, identify characters, settings, scenes, themes, and motifs, and return them as PROPOSE_ENTITY or PROPOSE_ENTITY_UPDATE tool intents."
        : "",
      "CRITICAL PROVENANCE-FIRST RULE FOR ENTITIES:",
      "Every PROPOSE_ENTITY and PROPOSE_ENTITY_UPDATE intent MUST follow a strict provenance-first policy:",
      "1. The payload must have name, type, and an attributes object.",
      "2. The type MUST be one of: CHARACTER, SETTING, SCENE, RELATIONSHIP, TIMELINE_EVENT, THEME_MOTIF.",
      "3. The attributes object MUST contain a 'sourceExcerpt' field with the exact, literal quote from the text supporting the entity's existence.",
      "4. The attributes object should also describe the entity's relevance (e.g. role, importance, or connection to themes).",
      "5. Do not invent any facts. If the text does not mention an attribute, do not guess.",
      "",
      "For EVERY tool intent you propose, you MUST explain 'why this suggestion?' in the explanation field.",
      "",
      ragContextChunks.length > 0 ? "SEMANTIC RAG LORE CONTEXT (Automatically retrieved via pgvector similarity search based on the user's prompt):" : "",
      ragContextChunks.length > 0 ? JSON.stringify(ragContextChunks, null, 2) : "",
      "",
      "Current context:",
      JSON.stringify(context, null, 2),
    ].filter(Boolean).join("\n");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_ASSISTANT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: assistantResponseSchema,
        systemInstruction: "Be an empowering research and drafting assistant. Return structured JSON only. You may draft or rewrite content, but always propose changes via safe tool intents rather than directly mutating the manuscript.",
        temperature: 0.25,
      },
    });

    if (!response.text) {
      try {
        const normalizedFallback = normalizeAssistantPayload(localAssistantFallback(context));
        const toolIntents = await persistAssistantToolIntents(prisma, sessionId!, normalizedFallback.toolIntents);
        return NextResponse.json({
          ok: true,
          sessionId,
          ...normalizedFallback,
          source: "local-fallback",
          toolIntents,
          warning: "Gemini returned an empty response, so Quipsly used local fallback guidance with durable review receipts.",
        });
      } catch (dbError) {
        console.error("[quipsly-assistant] Failed to persist empty-provider fallback actions:", dbError);
        return NextResponse.json({
          ok: false,
          error: "Quipsly prepared fallback guidance but could not record its action and ledger receipts atomically. No actionable proposal was returned.",
        }, { status: 503 });
      }
    }

    const payload = normalizeAssistantPayload(JSON.parse(response.text));
    if (context.documentId) {
      payload.toolIntents = anchorEntityProposalSources(payload.toolIntents, context.documentId, context.visibleBlocks);
    }

    if (sessionId && payload.toolIntents.length > 0) {
      try {
        payload.toolIntents = await persistAssistantToolIntents(prisma, sessionId, payload.toolIntents);
      } catch (dbError) {
        console.error("[quipsly-assistant] Failed to persist proposed actions:", dbError);
        return NextResponse.json({
          ok: false,
          error: "Quipsly generated a proposal but could not record its action and ledger receipt atomically. No actionable proposal was returned.",
        }, { status: 503 });
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      ...payload,
      actions: [],
      warning: ragWarning,
    });
  } catch (error) {
    console.error("[quipsly-assistant] failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly assistant failed safely before changing anything." }, { status: 500 });
  }
}
