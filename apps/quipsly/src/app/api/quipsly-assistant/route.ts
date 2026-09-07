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
} from "@high-ground/quipsly-domain/output-catalog";
import {
  createGovernedAssistantProposalRun,
  governedActionSha256,
} from "@/lib/server/governed-action-runtime";
import { governedCapabilityForAssistantToolKind } from "@high-ground/quipsly-domain/governed-actions";
import { applyAssistantDocumentEditAction, type AssistantDocumentApplyReceipt } from "@/app/(app)/create/actions";

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
      description: "Bounded tool results or proposed edits. Read-only work runs immediately; a write happens only when its explicit Apply, Add, Publish, Share, or Delete action is chosen.",
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

function normalizeAssistantPayload(raw: unknown) {
  const payload = asRecord(raw);
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  const toolIntents = Array.isArray(payload.toolIntents) ? payload.toolIntents : [];

  return {
    source: "gemini",
    assistantMessage: cleanText(payload.assistantMessage, 1400) || "Here is the result of your request.",
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
  governance: {
    projectId: string;
    documentId: string | null;
    actorUserId: string;
    actorEmail: string;
    intent: string;
    sourceSurface: string;
    provider: string;
    model?: string | null;
    readSet: Array<Record<string, unknown>>;
  },
) {
  if (toolIntents.length === 0) return toolIntents;
  const savedActions = await prisma.$transaction(async (tx) => {
    const saved: Array<{ id: string; sourceIndex: number; intent: NormalizedToolIntent }> = [];
    for (const [sourceIndex, intent] of toolIntents.entries()) {
      const capability = governedCapabilityForAssistantToolKind(intent.kind);
      if (!capability) throw new Error(`UNREGISTERED_ASSISTANT_CAPABILITY:${intent.kind}`);
      const assistantStatus = capability.decisionPolicy === "EXPLICIT_APPROVAL" ? "proposed" : "ready";
      const action = await tx.studioAssistantAction.create({
        data: {
          sessionId,
          kind: intent.kind,
          label: intent.label,
          explanation: intent.explanation,
          riskLevel: intent.riskLevel.toUpperCase(),
          payloadJson: intent.payload as any,
          status: assistantStatus,
        },
        select: { id: true },
      });
      await tx.studioAssistantLedger.create({
        data: {
          actionId: action.id,
          previousStatus: null,
          newStatus: assistantStatus,
          notes: JSON.stringify({
            kind: "quipsly-assistant-action-created-v2",
            actionKind: intent.kind,
            decisionPolicy: capability.decisionPolicy,
          }),
        },
      });
      saved.push({ id: action.id, sourceIndex, intent });
    }
    const governed = await createGovernedAssistantProposalRun(tx, {
      ...governance,
      assistantSessionId: sessionId,
      proposals: saved.map((item) => ({
        assistantActionId: item.id,
        kind: item.intent.kind,
        label: item.intent.label,
        explanation: item.intent.explanation,
        payload: item.intent.payload,
      })),
    });
    return { saved, governed };
  });
  const persistedIds = new Map(savedActions.saved.map((saved) => [saved.sourceIndex, saved.id]));
  const governedIds = new Map(savedActions.governed.actions.map((saved) => [saved.assistantActionId, saved]));
  return toolIntents.map((intent, sourceIndex) => ({
    ...intent,
    id: persistedIds.get(sourceIndex),
    status: governedIds.get(persistedIds.get(sourceIndex) ?? "")?.assistantStatus,
    governance: (() => {
      const governed = governedIds.get(persistedIds.get(sourceIndex) ?? "");
      return governed ? {
        actionId: governed.governedActionId,
        runId: savedActions.governed.runId,
        capabilityId: governed.capabilityId,
        decisionPolicy: governed.decisionPolicy,
        decisionStatus: governed.decisionStatus,
        status: governed.status,
        recovery: null,
      } : undefined;
    })(),
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

    const session = await prisma.studioAssistantSession.findFirst({
      where: {
        projectId: project.id,
        documentId: documentId || null,
        ownerUserId: actorUserId,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "desc" }
    });

    if (!session) {
      return NextResponse.json({ ok: true, session: null });
    }

    let actions: Array<Record<string, unknown>> = [];
    if (process.env.DATABASE_URL && session) {
      const dbActions = await prisma.studioAssistantAction.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          governedAction: {
            select: {
              id: true,
              runId: true,
              capabilityId: true,
              decisionPolicy: true,
              decisionStatus: true,
              status: true,
              recoveryJson: true,
            },
          },
        },
      });
      actions = dbActions.map((dbAction) => ({
        id: dbAction.id,
        kind: dbAction.kind,
        label: dbAction.label,
        explanation: dbAction.explanation,
        status: dbAction.status,
        payload: dbAction.payloadJson,
        createdAt: dbAction.createdAt,
        governance: dbAction.governedAction ? {
          actionId: dbAction.governedAction.id,
          runId: dbAction.governedAction.runId,
          capabilityId: dbAction.governedAction.capabilityId,
          decisionPolicy: dbAction.governedAction.decisionPolicy,
          decisionStatus: dbAction.governedAction.decisionStatus,
          status: dbAction.governedAction.status,
          recovery: dbAction.governedAction.recoveryJson,
        } : undefined,
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
          ownerUserId: actorUserId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!requestedSession) {
        return NextResponse.json({ ok: false, error: "That assistant session does not belong to this Nest and document. No provider request was sent." }, { status: 409 });
      }
    } else {
      const activeSession = await prisma.studioAssistantSession.findFirst({
        where: {
          projectId: project.id,
          documentId: context.documentId || null,
          ownerUserId: actorUserId,
          status: "ACTIVE",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      } else {
        const newSession = await prisma.studioAssistantSession.create({
          data: {
            projectId: project.id,
            documentId: context.documentId || null,
            ownerUserId: actorUserId,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        sessionId = newSession.id;
      }
    }

    const actorEmail = actorSession.user.primaryEmail || actorSession.user.email || "unknown@quipsly.invalid";
    const governanceFor = (
      provider: string,
      model: string | null,
      additionalReadSet: Array<Record<string, unknown>> = [],
    ) => ({
      projectId: project.id,
      documentId: context.documentId || null,
      actorUserId,
      actorEmail,
      intent: context.message,
      sourceSurface: "nest-writing-assistant",
      provider,
      model,
      readSet: [
        ...(context.documentId ? [{ objectType: "StudioDocument", objectId: context.documentId }] : []),
        ...context.visibleBlocks.map((block) => ({
          objectType: "StudioDocumentBlock",
          objectId: block.id || null,
          contentSha256: governedActionSha256(block.text || ""),
        })),
        ...additionalReadSet,
      ],
    });

    const providerDisabled = process.env.QUIPSLY_DISABLE_AI_PROVIDER === "true";
    const apiKey = providerDisabled ? undefined : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        sessionId,
        code: "AI_UNAVAILABLE",
        error: "AI writing is unavailable right now. Your page is unchanged. You can keep writing and try again later.",
      }, { status: 503 });
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
        // An embedding is a search hint, not current authorization or current
        // source text. Rehydrate each hit through the actor-scoped live model.
        const [blocks, quotes] = await Promise.all([
          prisma.studioDocumentBlock.findMany({ where: {
            id: { in: relevantChunks.filter((chunk) => chunk.sourceOrigin === "studio-document-block").map((chunk) => chunk.sourceId) },
            archivedAt: null,
            document: { projectId: project.id, ...personalWritingDocumentVisibilityWhere(actorUserId) },
          }, select: { id: true, body: true } }),
          prisma.quipLoreQuote.findMany({ where: {
            projectId: project.id,
            id: { in: relevantChunks.filter((chunk) => chunk.sourceOrigin === "quipsly-lore-quote").map((chunk) => chunk.sourceId) },
          }, select: { id: true, text: true } }),
        ]);
        const sourceText = new Map<string, string>([
          ...blocks.map((block) => [`studio-document-block:${block.id}`, block.body] as const),
          ...quotes.map((quote) => [`quipsly-lore-quote:${quote.id}`, quote.text] as const),
        ]);
        ragContextChunks = relevantChunks.flatMap((chunk) => {
          const text = sourceText.get(`${chunk.sourceOrigin}:${chunk.sourceId}`);
          return text === undefined ? [] : [{ ...chunk, contentSnapshot: text.slice(0, 8000) }];
        });
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
      "Fulfill the user's request directly. When asked to write, rewrite, or fix continuity, return the corresponding writing tool intent: the product saves it automatically and shows the result with undo. Do not rewrite text when the user only asks a question, requests analysis, or asks for a preview. Original transcript and research evidence is read-only; create editable writing alongside it.",
      "Never claim a manuscript change happened until the product returns its persisted result.",
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
        systemInstruction: "Help the user complete their creative work. Return structured JSON only. Requested drafts and rewrites execute through the authorized writing service, with visible results and undo. Answer questions without unsolicited rewrites. Never claim a save before the product confirms it.",
        temperature: 0.25,
      },
    });

    if (!response.text) {
      return NextResponse.json({
        ok: false,
        sessionId,
        code: "AI_EMPTY_RESPONSE",
        error: "Quipsly did not receive an answer. Your page is unchanged. Please try again.",
      }, { status: 502 });
    }

    const payload = normalizeAssistantPayload(JSON.parse(response.text));
    if (context.documentId) {
      payload.toolIntents = anchorEntityProposalSources(payload.toolIntents, context.documentId, context.visibleBlocks);
    }

    if (sessionId && payload.toolIntents.length > 0) {
      try {
        payload.toolIntents = await persistAssistantToolIntents(
          prisma,
          sessionId,
          payload.toolIntents,
          governanceFor(
            "gemini",
            process.env.GEMINI_ASSISTANT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
            ragContextChunks.map((chunk) => ({
              objectType: chunk.sourceOrigin,
              objectId: chunk.sourceId,
              contentSha256: governedActionSha256(chunk.contentSnapshot),
            })),
          ),
        );
      } catch (dbError) {
        console.error("[quipsly-assistant] Failed to persist proposed actions:", dbError);
        return NextResponse.json({
          ok: false,
          error: "Quipsly generated useful work but could not safely retain its action receipts, so it returned no actions.",
        }, { status: 503 });
      }
    }

    const documentEdits: AssistantDocumentApplyReceipt[] = [];
    const writeWarnings: string[] = [];
    for (const intent of payload.toolIntents) {
      if (!["PROPOSE_DRAFT", "PROPOSE_REWRITE", "PROPOSE_CONTINUITY_FIX"].includes(intent.kind)) continue;
      const action = intent as typeof intent & { id?: string; status?: string; governance?: { status: string; decisionStatus: string } };
      if (!action.id) continue;
      const result = await applyAssistantDocumentEditAction(action.id);
      if (result.ok) {
        action.status = "applied";
        if (action.governance) {
          action.governance.status = "SUCCEEDED";
          action.governance.decisionStatus = "NOT_REQUIRED";
        }
        documentEdits.push(result.receipt);
      } else {
        // Preserve a retriable ordinary action, not an approval requirement.
        action.status = "proposed";
        await prisma.studioAssistantAction.update({ where: { id: action.id }, data: { status: "proposed" } });
        writeWarnings.push(result.error);
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      ...payload,
      actions: [],
      documentEdits,
      warning: [ragWarning, ...writeWarnings].filter(Boolean).join(" ") || undefined,
    });
  } catch (error) {
    console.error("[quipsly-assistant] failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not finish this request. Any saved writing is still available; reload the page to see its latest state." }, { status: 500 });
  }
}
