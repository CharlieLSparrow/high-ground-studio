import { GoogleGenAI, Schema, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";

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
            description: "One of suggest-tags, find-related-blocks, create-research-packet-note, summarize-selected-block, PROPOSE_ENTITY, PROPOSE_ENTITY_UPDATE.",
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
  "PROPOSE_ENTITY",
  "PROPOSE_ENTITY_UPDATE",
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

function localAssistantFallback(context: Required<Pick<AssistantRequestBody, "message" | "projectSlug" | "documentTitle" | "activeViewName">> & {
  activeBoundary: AssistantBoundaryContext | null;
  visibleBlocks: AssistantBlockContext[];
  recentTags: string[];
}) {
  const boundaryLabel = context.activeBoundary?.label;
  const hasStructure = context.visibleBlocks.some((block) =>
    (block.tags ?? []).includes("chapter") || (block.tags ?? []).includes("episode")
  );

  return {
    source: "local-fallback",
    assistantMessage: boundaryLabel
      ? `I can see ${boundaryLabel}. I will stay in research-assistant mode: organize, retrieve, compare, and propose changes for approval.`
      : "I can help organize this project without taking over the writing. Ask me to find related material, suggest tags, summarize a selected block, or prepare a research packet.",
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
    ],
    toolIntents: [
      {
        kind: "find-related-blocks",
        label: boundaryLabel ? `Find related material for ${boundaryLabel}` : "Find related manuscript material",
        explanation: "Why this suggestion? Searching the visible manuscript context for blocks that appear related to the current writing focus helps build consistent lore.",
        riskLevel: "low",
        payload: {
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
      return {
        kind,
        label: cleanText(record.label, 120) || kind,
        explanation: cleanText(record.explanation, 700),
        riskLevel: normalizedRiskLevel,
        payload: asRecord(record.payload),
      };
    }).filter((item): item is NormalizedToolIntent => item !== null),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectSlug = searchParams.get("projectSlug");
    const documentId = searchParams.get("documentId");

    if (!projectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: true, fallback: true });
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
    return NextResponse.json({ ok: true, fallback: true, error: "Failed to retrieve session from database." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AssistantRequestBody;
    const context = {
      sessionId: body.sessionId,
      message: cleanText(body.message, 1600),
      projectSlug: cleanText(body.projectSlug, 120) || "unknown-project",
      documentId: cleanText(body.documentId, 120),
      documentTitle: cleanText(body.documentTitle, 180) || "Untitled document",
      activeBoundary: cleanBoundary(body.activeBoundary),
      activeViewName: cleanText(body.activeViewName, 120) || "Everything Mode",
      visibleBlocks: cleanBlocks(body.visibleBlocks),
      recentTags: cleanTags(body.recentTags),
    };

    if (!context.message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    let sessionId = context.sessionId;

    if (process.env.DATABASE_URL) {
      try {
        const prisma = getPrismaClient();
        const project = await prisma.studioProject.findFirst({
          where: { slug: context.projectSlug }
        });

        if (project) {
          // Tenancy access check
          try {
            await requireProjectAccess(project.slug, "read");
          } catch (accessErr: any) {
            const message = accessErr.message || "Forbidden";
            return NextResponse.json({ ok: false, error: message }, { status: message.startsWith("UNAUTHORIZED") ? 401 : 403 });
          }

          if (!sessionId) {
            const activeSession = await (prisma as any).studioAssistantSession.findFirst({
              where: { projectId: project.id, documentId: context.documentId || null, status: "ACTIVE" },
              orderBy: { createdAt: "desc" }
            });

            if (activeSession) {
              sessionId = activeSession.id;
            } else {
              const newSession = await (prisma as any).studioAssistantSession.create({
                data: {
                  projectId: project.id,
                  documentId: context.documentId || null,
                  status: "ACTIVE"
                }
              });
              sessionId = newSession.id;
            }
          }
        }
      } catch (error) {
        console.error("[quipsly-assistant] DB error resolving session:", error);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        sessionId,
        ...localAssistantFallback(context),
        warning: "GEMINI_API_KEY is not configured, so Quipsly used local fallback guidance.",
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const isScanRequest = context.message.startsWith("SCAN_SECTION_FOR_ENTITIES:");
    const prompt = [
      "You are a Quipsly: a tiny research and organization assistant for writers, authors, academics, podcasters, and creators.",
      "You are not a ghostwriter. Do not replace the human author's voice.",
      "Your job is to collect, organize, compare, retrieve, cite, summarize, and prepare safe proposed actions.",
      "Quipslys may draft examples, but never black-box write.",
      "Never claim you changed the manuscript. You can only propose tool intents.",
      "",
      "Safe tool kinds:",
      "- suggest-tags (Only suggest Chapter/Episode tags to organize structure)",
      "- summarize-selected-block (Summarize a selected block as a preview)",
      "- find-related-blocks (Find related visible blocks)",
      "- create-research-packet-note (Create a draft research packet preview)",
      "- PROPOSE_ENTITY (Propose creating a new entity in the Story Bible/Study Corpus)",
      "- PROPOSE_ENTITY_UPDATE (Propose updating an existing entity's attributes in the Story Bible/Study Corpus)",
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
      "Current context:",
      JSON.stringify(context, null, 2),
    ].filter(Boolean).join("\n");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_ASSISTANT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: assistantResponseSchema,
        systemInstruction: "Be a cautious research assistant. Return structured JSON only. Do not directly author or mutate the user's manuscript.",
        temperature: 0.25,
      },
    });

    if (!response.text) {
      return NextResponse.json({
        ok: true,
        sessionId,
        ...localAssistantFallback(context),
        warning: "Gemini returned an empty response, so Quipsly used local fallback guidance.",
      });
    }

    const payload = normalizeAssistantPayload(JSON.parse(response.text));

    if (process.env.DATABASE_URL && sessionId && payload.toolIntents.length > 0) {
      try {
        const prisma = getPrismaClient();
        const actionsToSave = payload.toolIntents.filter(
          (intent) =>
            intent.kind === "PROPOSE_ENTITY" ||
            intent.kind === "PROPOSE_ENTITY_UPDATE"
        );

        if (actionsToSave.length > 0) {
          const savedActions = await Promise.all(
            actionsToSave.map((action) =>
              prisma.studioAssistantAction.create({
                data: {
                  sessionId: sessionId!,
                  kind: action.kind,
                  label: action.label,
                  explanation: action.explanation,
                  riskLevel: action.riskLevel.toUpperCase(),
                  payloadJson: action.payload as any,
                  status: "proposed",
                },
              })
            )
          );
          
          // Log each created action in the assistant ledger
          await Promise.all(
            savedActions.map((action) =>
              prisma.studioAssistantLedger.create({
                data: {
                  actionId: action.id,
                  previousStatus: null,
                  newStatus: "proposed",
                  notes: "AI suggested entity scan action created",
                },
              })
            )
          );

          // Update payload to use real DB ids for these intents
          payload.toolIntents = payload.toolIntents.map((intent) => {
            const savedMatch = savedActions.find(
              (sa) => sa.kind === intent.kind && sa.label === intent.label
            );
            if (savedMatch) {
              return { ...intent, id: savedMatch.id } as any;
            }
            return intent;
          });
        }
      } catch (dbError) {
        console.error("[quipsly-assistant] Failed to persist proposed actions:", dbError);
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      ...payload,
      actions: [], 
    });
  } catch (error) {
    console.error("[quipsly-assistant] failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly assistant failed safely before changing anything." }, { status: 500 });
  }
}

