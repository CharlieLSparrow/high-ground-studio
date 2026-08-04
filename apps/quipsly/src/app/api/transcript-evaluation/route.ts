import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  appendTranscriptEvaluationCandidate,
  appendTranscriptEvaluationCorrectionObservation,
  exportTranscriptEvaluationRunnerInput,
  readTranscriptEvaluationCandidates,
  TranscriptEvaluationCandidateError,
} from "@/lib/server/transcript-evaluation-candidates";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 2_300_000;

function response(body: Record<string, unknown>, status = 200, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function actor(session: NonNullable<Awaited<ReturnType<typeof getQuipslySessionFromRequest>>>) {
  return {
    id: session.user.id,
    email: session.user.primaryEmail,
    isStaff: session.user.isStaff,
  };
}

function failure(error: unknown) {
  if (error instanceof TranscriptEvaluationCandidateError) {
    return response({ ok: false, errorCode: error.code, error: error.message }, error.status);
  }
  console.error("[transcript-evaluation] request failed", error);
  return response({ ok: false, errorCode: "TRANSCRIPT_EVALUATION_UNAVAILABLE", error: "Transcript evaluation evidence is temporarily unavailable." }, 503);
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return response({ ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in to access private transcript evaluation evidence." }, 401);
  const url = new URL(request.url);
  const roomId = text(url.searchParams.get("roomId"));
  if (!roomId) return response({ ok: false, errorCode: "ROOM_REQUIRED", error: "roomId is required." }, 400);
  try {
    const prisma = getPrismaClient() as any;
    if (url.searchParams.get("view") === "runner-input") {
      const exported = await exportTranscriptEvaluationRunnerInput({ prisma, actor: actor(session), roomId });
      return response(exported, 200, {
        "Content-Disposition": `attachment; filename="quipsly-transcript-runner-${roomId}.json"`,
      });
    }
    return response({ ok: true, ...(await readTranscriptEvaluationCandidates({ prisma, actor: actor(session), roomId })) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return response({ ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in to append transcript evaluation evidence." }, 401);
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return response({ ok: false, errorCode: "TRANSCRIPT_EVALUATION_REQUEST_TOO_LARGE", error: "Transcript evaluation request exceeds 2.3 MB." }, 413);
  }
  let body: Record<string, unknown>;
  try {
    body = object(await request.json());
  } catch {
    return response({ ok: false, errorCode: "INVALID_JSON", error: "Provide a valid transcript evaluation request." }, 400);
  }
  const operation = text(body.operation);
  const prisma = getPrismaClient() as any;
  try {
    if (operation === "append-candidate") {
      return response(await appendTranscriptEvaluationCandidate({
        prisma,
        actor: actor(session),
        windowId: text(body.windowId),
        clientRequestId: text(body.clientRequestId),
        runKey: text(body.runKey),
        requestConfig: body.requestConfig,
        rawResponse: body.rawResponse,
        policy: body.policy,
        candidate: body.candidate,
      }), 201);
    }
    if (operation === "append-correction-observation") {
      return response(await appendTranscriptEvaluationCorrectionObservation({
        prisma,
        actor: actor(session),
        candidateId: text(body.candidateId),
        clientRequestId: text(body.clientRequestId),
        elapsedMilliseconds: body.elapsedMilliseconds,
        operationCount: body.operationCount,
        observedAt: body.observedAt,
        observation: body.observation,
      }), 201);
    }
    return response({ ok: false, errorCode: "TRANSCRIPT_EVALUATION_OPERATION_INVALID", error: "Choose append-candidate or append-correction-observation." }, 400);
  } catch (error) {
    return failure(error);
  }
}
