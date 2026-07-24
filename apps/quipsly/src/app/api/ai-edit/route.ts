import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

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
};

type EditSuggestion =
  | { type: "deactivate"; blockId: string }
  | { type: "add_keyframe"; timeOffset: number; x: number; y: number; scale: number };

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
    blocks.push({ id, text, time, duration });
  }
  return { blocks };
}

function normalizeSuggestions(value: unknown, blocks: TranscriptBlock[]): EditSuggestion[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const edits = (value as Record<string, unknown>).edits;
  if (!Array.isArray(edits)) return [];
  const blockIds = new Set(blocks.map((block) => block.id));
  const timelineEnd = Math.max(...blocks.map((block) => block.time + block.duration));
  const normalized: EditSuggestion[] = [];

  for (const edit of edits.slice(0, MAX_SUGGESTIONS)) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) continue;
    const candidate = edit as Record<string, unknown>;
    if (candidate.type === "deactivate" && typeof candidate.blockId === "string" && blockIds.has(candidate.blockId)) {
      normalized.push({ type: "deactivate", blockId: candidate.blockId });
      continue;
    }
    if (candidate.type !== "add_keyframe") continue;
    const timeOffset = finite(candidate.timeOffset);
    const x = finite(candidate.x);
    const y = finite(candidate.y);
    const scale = finite(candidate.scale);
    if (
      timeOffset === null || timeOffset < 0 || timeOffset > timelineEnd ||
      x === null || x < -180 || x > 180 ||
      y === null || y < -90 || y > 90 ||
      scale === null || scale < 10 || scale > 150
    ) continue;
    normalized.push({ type: "add_keyframe", timeOffset, x, y, scale });
  }
  return normalized;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return json({ ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in before requesting edit suggestions.", edits: [] }, 401);
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

  if (body.providerDisclosureAccepted !== true) {
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

  const formattedTranscript = parsedTranscript.blocks.map((block) =>
    `[BlockID: ${block.id}] [Time: ${block.time.toFixed(2)}s - ${(block.time + block.duration).toFixed(2)}s]: ${block.text}`
  ).join("\n");
  const prompt = `
You are reviewing a transcript timeline and may return edit suggestions only. Do not claim to apply an edit.

1. Suggest "deactivate" only for filler, stumbles, or clearly off-topic material. Preserve meaning and breathing room.
2. Suggest "add_keyframe" only for a motivated 360-camera reframe. x is yaw (-180..180), y is pitch (-90..90), and scale is field of view (10..150).
3. Reference only the supplied block IDs and timeline range. The producer will review every suggestion before it changes the edit.

Transcript:
${formattedTranscript}`;

  try {
    const ai = new GoogleGenAI({ apiKey: configuredKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_EDIT_MODEL?.trim() || "gemini-2.5-pro",
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
                },
                required: ["type"],
              },
            },
          },
          required: ["edits"],
        },
      },
    });
    const providerPayload = response.text ? JSON.parse(response.text) : { edits: [] };
    const edits = normalizeSuggestions(providerPayload, parsedTranscript.blocks);
    return json({
      ok: true,
      edits,
      suggestionCount: edits.length,
      applied: false,
      source: "configured-ai-provider",
      nextAction: edits.length
        ? "Review each suggestion before applying it to the timeline."
        : "No valid edit suggestions were returned; the timeline is unchanged.",
    }, 200);
  } catch (error) {
    console.error("AI edit suggestion request failed", error);
    return json({
      ok: false,
      errorCode: "AI_EDIT_PROVIDER_UNAVAILABLE",
      error: "The configured AI provider could not return verified edit suggestions. The timeline is unchanged.",
      edits: [],
      applied: false,
    }, 502);
  }
}
