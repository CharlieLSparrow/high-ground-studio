import { createHash, randomUUID } from "node:crypto";

import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

import {
  AI_EDIT_PROPOSAL_SET_KIND,
  AI_EDIT_PROPOSAL_SET_VERSION,
  aiEditTranscriptBounds,
  canonicalAiEditTranscript,
  type AiEditProposal,
} from "@/lib/editor/ai-edit-proposal-contract";
import { getPrismaClient } from "@/lib/prisma";
import { deterministicEditEvidence } from "@/lib/server/deterministic-edit-evidence";
import { episodeEditSignalVisualization, loadEpisodeEditSignalEvidence } from "@/lib/server/episode-edit-signal-evidence";
import {
  EpisodeEditReviewLedgerError,
  persistEpisodeEditProposalSet,
} from "@/lib/server/episode-edit-review-ledger";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

const MAX_REQUEST_BYTES = 200_000;
const MAX_TRANSCRIPT_BLOCKS = 500;
const MAX_BLOCK_TEXT = 4_000;
const MAX_TRANSCRIPT_TEXT = 100_000;
const MAX_SUGGESTIONS = 100;

type TranscriptBlock = {
  id: string;
  time: number;
  duration: number;
  text: string;
  alert?: string | null;
  speaker?: string | null;
};

type EditSuggestion =
  | { type: "deactivate"; blockId: string; rationale: string; confidence: "low" | "medium" | "high" }
  | { type: "add_keyframe"; timeOffset: number; x: number; y: number; scale: number; rationale: string; confidence: "low" | "medium" | "high" };

const SHA256 = /^[0-9a-f]{64}$/;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTranscriptBlocks(value: unknown): { blocks: TranscriptBlock[]; error?: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { blocks: [], error: "At least one transcript block is required." };
  }
  if (value.length > MAX_TRANSCRIPT_BLOCKS) {
    return { blocks: [], error: `At most ${MAX_TRANSCRIPT_BLOCKS} transcript blocks can be reviewed at once.` };
  }

  let totalText = 0;
  const ids = new Set<string>();
  const blocks: TranscriptBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { blocks: [], error: "Every transcript block must be a structured record." };
    }
    const source = item as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    const text = typeof source.text === "string" ? source.text.trim() : "";
    const time = finite(source.time) ?? finite(source.startIn);
    const duration = finite(source.duration);
    if (!id || id.length > 160 || ids.has(id)) {
      return { blocks: [], error: "Transcript block IDs must be unique and at most 160 characters." };
    }
    if (!text || text.length > MAX_BLOCK_TEXT) {
      return { blocks: [], error: `Transcript block text must be 1-${MAX_BLOCK_TEXT} characters.` };
    }
    if (time === null || time < 0 || time > 86_400 || duration === null || duration <= 0 || duration > 3_600) {
      return { blocks: [], error: "Transcript timing is outside the supported range." };
    }
    totalText += text.length;
    if (totalText > MAX_TRANSCRIPT_TEXT) {
      return { blocks: [], error: `Transcript text may be at most ${MAX_TRANSCRIPT_TEXT} characters per review.` };
    }
    ids.add(id);
    const alert = typeof source.alert === "string" ? source.alert.trim().slice(0, 160) || null : null;
    const speaker = typeof (source.speaker ?? source.speakerLabel) === "string"
      ? String(source.speaker ?? source.speakerLabel).trim().slice(0, 160) || null
      : null;
    blocks.push({ id, text, time, duration, alert, speaker });
  }
  return { blocks };
}

function normalizeSuggestions(value: unknown, blocks: TranscriptBlock[]): EditSuggestion[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const edits = (value as Record<string, unknown>).edits;
  if (!Array.isArray(edits)) return [];
  const blockIds = new Set(blocks.map((block) => block.id));
  const timelineStart = Math.min(...blocks.map((block) => block.time));
  const timelineEnd = Math.max(...blocks.map((block) => block.time + block.duration));
  const normalized: EditSuggestion[] = [];

  for (const edit of edits.slice(0, MAX_SUGGESTIONS)) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) continue;
    const candidate = edit as Record<string, unknown>;
    const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim().slice(0, 500) : "";
    const confidence = candidate.confidence === "high" || candidate.confidence === "medium" || candidate.confidence === "low"
      ? candidate.confidence
      : null;
    if (!rationale || !confidence) continue;
    if (candidate.type === "deactivate" && typeof candidate.blockId === "string" && blockIds.has(candidate.blockId)) {
      normalized.push({ type: "deactivate", blockId: candidate.blockId, rationale, confidence });
      continue;
    }
    if (candidate.type !== "add_keyframe") continue;
    const timeOffset = finite(candidate.timeOffset);
    const x = finite(candidate.x);
    const y = finite(candidate.y);
    const scale = finite(candidate.scale);
    if (
      timeOffset === null || timeOffset < timelineStart || timeOffset > timelineEnd ||
      x === null || x < -180 || x > 180 ||
      y === null || y < -90 || y > 90 ||
      scale === null || scale < 10 || scale > 150
    ) continue;
    normalized.push({ type: "add_keyframe", timeOffset, x, y, scale, rationale, confidence });
  }
  return normalized;
}

function proposalFromSuggestion(input: {
  suggestion: EditSuggestion;
  blocks: TranscriptBlock[];
}): AiEditProposal {
  if (input.suggestion.type === "deactivate") {
    const blockId = input.suggestion.blockId;
    const block = input.blocks.find((candidate) => candidate.id === blockId)!;
    const evidenceHash = createHash("sha256")
      .update(canonicalAiEditTranscript([block]))
      .digest("hex");
    return {
      proposalId: `edit_proposal_${randomUUID().replaceAll("-", "")}`,
      type: "deactivate",
      sourceRange: { startSeconds: block.time, endSeconds: block.time + block.duration },
      evidence: { blockIds: [block.id], transcriptTextSha256: evidenceHash },
      rationale: input.suggestion.rationale,
      confidence: input.suggestion.confidence,
      changesSource: false,
      applied: false,
      blockId: block.id,
    };
  }
  const timeOffset = input.suggestion.timeOffset;
  const bounds = aiEditTranscriptBounds(input.blocks);
  const sourceRange = {
    startSeconds: Math.max(bounds.startSeconds, timeOffset - 1.5),
    endSeconds: Math.min(bounds.endSeconds, timeOffset + 1.5),
  };
  const evidenceBlocks = input.blocks.filter((block) =>
    block.time < sourceRange.endSeconds && block.time + block.duration > sourceRange.startSeconds
  );
  const nearestEvidence = evidenceBlocks.length
    ? evidenceBlocks
    : [input.blocks.reduce((nearest, block) =>
        Math.abs(block.time - timeOffset) < Math.abs(nearest.time - timeOffset)
          ? block
          : nearest
      )];
  const evidenceHash = createHash("sha256")
    .update(canonicalAiEditTranscript(nearestEvidence))
    .digest("hex");
  return {
    proposalId: `edit_proposal_${randomUUID().replaceAll("-", "")}`,
    type: "add_keyframe",
    sourceRange,
    evidence: {
      blockIds: nearestEvidence.map((block) => block.id),
      transcriptTextSha256: evidenceHash,
    },
    rationale: input.suggestion.rationale,
    confidence: input.suggestion.confidence,
    changesSource: false,
    applied: false,
    timeOffset,
    x: input.suggestion.x,
    y: input.suggestion.y,
    scale: input.suggestion.scale,
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return json({ ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in before requesting edit suggestions.", edits: [] }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, errorCode: "REQUEST_TOO_LARGE", error: "The edit-review request is too large.", edits: [] }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, errorCode: "INVALID_JSON", error: "Provide a valid edit-review request.", edits: [] }, 400);
  }

  const analysisMode = body.analysisMode === "deterministic" ? "deterministic" : "provider";
  if (analysisMode === "provider" && body.providerDisclosureAccepted !== true) {
    return json({
      ok: false,
      errorCode: "AI_PROVIDER_DISCLOSURE_REQUIRED",
      error: "Confirm that the selected transcript text may be sent to the configured AI provider for suggestions.",
      edits: [],
      applied: false,
    }, 409);
  }

  const parsedTranscript = parseTranscriptBlocks(body.transcriptBlocks);
  if (parsedTranscript.error) {
    return json({ ok: false, errorCode: "INVALID_TRANSCRIPT", error: parsedTranscript.error, edits: [] }, 400);
  }

  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  const episodeSlug = typeof body.episodeSlug === "string" ? body.episodeSlug.trim() : "";
  const timelineFingerprintSha256 = typeof body.timelineFingerprintSha256 === "string"
    ? body.timelineFingerprintSha256.trim().toLowerCase()
    : "";
  if (!projectSlug || !episodeSlug || !SHA256.test(timelineFingerprintSha256)) {
    return json({ ok: false, errorCode: "SOURCE_BINDING_REQUIRED", error: "Project, episode, and exact timeline fingerprint are required.", edits: [] }, 400);
  }
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({
    request,
    projectSlug,
    action: "write",
    prisma,
  });
  if (!access.allowed) {
    return json({ ok: false, errorCode: access.code, error: access.error, edits: [] }, access.status);
  }
  const accessProjectId = access.access.projectId;
  if (!accessProjectId) {
    return json({
      ok: false,
      errorCode: "SOURCE_PROJECT_UNRESOLVED",
      error: "The authorized Nest could not be bound to one canonical project. The timeline is unchanged.",
      edits: [],
    }, 409);
  }

  const canonicalTranscript = canonicalAiEditTranscript(parsedTranscript.blocks);
  const transcriptSha256 = createHash("sha256").update(canonicalTranscript).digest("hex");
  const bounds = aiEditTranscriptBounds(parsedTranscript.blocks);

  if (analysisMode === "deterministic") {
    const signalResolution = await loadEpisodeEditSignalEvidence({
      prisma,
      projectId: accessProjectId,
      projectSlug,
      episodeSlug,
    }).catch(() => ({
      status: "unavailable" as const,
      reason: "Decoded signal evidence could not be resolved, so transcript timing remains uncorroborated.",
      evidence: null,
      candidateCount: 0,
    }));
    const analysis = deterministicEditEvidence(parsedTranscript.blocks, {
      audioSignal: signalResolution.evidence,
    });
    const proposalSet = {
      kind: AI_EDIT_PROPOSAL_SET_KIND,
      version: AI_EDIT_PROPOSAL_SET_VERSION,
      proposalSetId: `edit_proposal_set_${randomUUID().replaceAll("-", "")}`,
      createdAt: new Date().toISOString(),
      binding: {
        projectSlug,
        episodeSlug,
        timelineFingerprintSha256,
        transcriptSha256,
        blockCount: parsedTranscript.blocks.length,
        ...bounds,
        ...(signalResolution.evidence ? {
          signalEvidence: {
            recordingAssetId: signalResolution.evidence.recordingAssetId,
            sourceSha256: signalResolution.evidence.sourceSha256,
            storageGeneration: signalResolution.evidence.storageGeneration,
            signalProfileSha256: signalResolution.evidence.signalProfileSha256,
            ...(signalResolution.evidence.protectedPlayback ? {
              protectedPlaybackSourceId: signalResolution.evidence.protectedPlayback.sourceId,
            } : {}),
          },
        } : {}),
      },
      provider: { kind: "deterministic" as const, model: "quipsly-source-evidence-v2" },
      proposals: analysis.proposals,
      reviewCandidates: analysis.reviewCandidates,
      boundaries: {
        sourceMediaUnchanged: true as const,
        proposalsOnly: true as const,
        proofWatchBeforeApply: true as const,
        staleBindingRejectsApply: true as const,
        noAutomaticSaveRenderOrPublish: true as const,
      },
    };
    try {
      await persistEpisodeEditProposalSet({
        prisma,
        projectId: accessProjectId,
        episodeSlug,
        actor: access.actor,
        proposalSet,
      });
    } catch (error) {
      console.error("Could not persist deterministic edit proposal set", error);
      const known = error instanceof EpisodeEditReviewLedgerError ? error : null;
      return json({
        ok: false,
        errorCode: known?.code ?? "EDIT_REVIEW_LEDGER_UNAVAILABLE",
        error: known?.message ?? "Quipsly found edit evidence but could not preserve its review history, so no proposals were shown.",
        edits: [],
        applied: false,
      }, known?.status ?? 503);
    }
    const itemCount = analysis.proposals.length + analysis.reviewCandidates.length;
    return json({
      ok: true,
      proposalSet,
      suggestionCount: analysis.proposals.length,
      reviewCandidateCount: analysis.reviewCandidates.length,
      signalEvidence: {
        status: signalResolution.status,
        reason: signalResolution.reason,
        candidateCount: signalResolution.candidateCount,
        boundRecordingAssetId: signalResolution.evidence?.recordingAssetId ?? null,
      },
      signalVisualization: signalResolution.evidence
        ? episodeEditSignalVisualization(signalResolution.evidence)
        : null,
      applied: false,
      source: "deterministic-transcript-evidence",
      nextAction: itemCount
        ? "Proof-listen to each exact source interval before applying a proposal."
        : "No deterministic edit evidence was found; the timeline is unchanged.",
    }, 200);
  }

  const configuredKey = process.env.GEMINI_API_KEY?.trim();
  if (!configuredKey) {
    return json({
      ok: false,
      errorCode: "AI_EDIT_PROVIDER_NOT_CONFIGURED",
      error: "AI edit suggestions are unavailable because no provider is configured. No mock edits were substituted.",
      edits: [],
      applied: false,
    }, 503);
  }

  const formattedTranscript = parsedTranscript.blocks.map((block) =>
    `[BlockID: ${block.id}] [Time: ${block.time.toFixed(2)}s - ${(block.time + block.duration).toFixed(2)}s]${block.speaker ? ` [Speaker: ${block.speaker}]` : ""}: ${block.text}`
  ).join("\n");
  const prompt = `
You are reviewing a transcript timeline and may return edit suggestions only. Do not claim to apply an edit.

1. Suggest "deactivate" only for filler, stumbles, or clearly off-topic material. Preserve meaning and breathing room.
2. Suggest "add_keyframe" only for a motivated 360-camera reframe. x is yaw (-180..180), y is pitch (-90..90), and scale is field of view (10..150).
3. Reference only the supplied block IDs and timeline range. The producer will review every suggestion before it changes the edit.
4. Give each suggestion a concise rationale grounded in the supplied transcript and a confidence of low, medium, or high. Do not invent visual evidence from transcript text.

Transcript:
${formattedTranscript}`;

  try {
    const ai = new GoogleGenAI({ apiKey: configuredKey });
    const model = process.env.GEMINI_EDIT_MODEL?.trim() || "gemini-2.5-pro";
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            edits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["deactivate", "add_keyframe"] },
                  blockId: { type: Type.STRING },
                  timeOffset: { type: Type.NUMBER },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  scale: { type: Type.NUMBER },
                  rationale: { type: Type.STRING },
                  confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
                },
                required: ["type", "rationale", "confidence"],
              },
            },
          },
          required: ["edits"],
        },
      },
    });
    const providerPayload = response.text ? JSON.parse(response.text) : { edits: [] };
    const edits = normalizeSuggestions(providerPayload, parsedTranscript.blocks);
    const proposals = edits.map((suggestion) => proposalFromSuggestion({ suggestion, blocks: parsedTranscript.blocks }));
    const proposalSet = {
      kind: AI_EDIT_PROPOSAL_SET_KIND,
      version: AI_EDIT_PROPOSAL_SET_VERSION,
      proposalSetId: `edit_proposal_set_${randomUUID().replaceAll("-", "")}`,
      createdAt: new Date().toISOString(),
      binding: {
        projectSlug,
        episodeSlug,
        timelineFingerprintSha256,
        transcriptSha256,
        blockCount: parsedTranscript.blocks.length,
        ...bounds,
      },
      provider: { kind: "google-gemini" as const, model },
      proposals,
      reviewCandidates: [],
      boundaries: {
        sourceMediaUnchanged: true as const,
        proposalsOnly: true as const,
        proofWatchBeforeApply: true as const,
        staleBindingRejectsApply: true as const,
        noAutomaticSaveRenderOrPublish: true as const,
      },
    };
    await persistEpisodeEditProposalSet({
      prisma,
      projectId: accessProjectId,
      episodeSlug,
      actor: access.actor,
      proposalSet,
    });
    return json({
      ok: true,
      proposalSet,
      suggestionCount: proposals.length,
      applied: false,
      source: "configured-ai-provider",
      nextAction: proposals.length
        ? "Review each suggestion before applying it to the timeline."
        : "No valid edit suggestions were returned; the timeline is unchanged.",
    }, 200);
  } catch (error) {
    console.error("AI edit suggestion request failed", error);
    if (error instanceof EpisodeEditReviewLedgerError) {
      return json({ ok: false, errorCode: error.code, error: error.message, edits: [], applied: false }, error.status);
    }
    return json({
      ok: false,
      errorCode: "AI_EDIT_PROVIDER_UNAVAILABLE",
      error: "The configured AI provider could not return verified edit suggestions. The timeline is unchanged.",
      edits: [],
      applied: false,
    }, 502);
  }
}
