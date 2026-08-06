import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  EpisodeAudioTrackDecisionError,
  readEpisodeAudioTrackDecisions,
  setEpisodeAudioTrackDecision,
  withdrawEpisodeAudioTrackDecision,
  type EpisodeAudioDecisionKind,
} from "@/lib/server/episode-audio-track-decisions";

export const runtime = "nodejs";

const KINDS = new Set<EpisodeAudioDecisionKind>(["track-role", "participant", "program-clock", "mix-disposition"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown) {
  const status = error instanceof EpisodeAudioTrackDecisionError ? error.status : 500;
  const code = error instanceof EpisodeAudioTrackDecisionError ? error.code : "EPISODE_AUDIO_DECISION_FAILED";
  const message = error instanceof Error ? error.message : "The Episode audio decision failed.";
  if (status >= 500) console.error("[episode-audio-decisions] operation failed", error);
  return NextResponse.json({ ok: false, code, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const projectId = text(request.nextUrl.searchParams.get("projectId"));
    const projectSlug = text(request.nextUrl.searchParams.get("projectSlug"));
    const episodeProductionId = text(request.nextUrl.searchParams.get("episodeProductionId"));
    if (!projectSlug || !episodeProductionId) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_DECISION_INVALID_REQUEST", error: "Nest and Episode identities are required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const ledger = await readEpisodeAudioTrackDecisions({ prisma, projectSlug, episodeProductionId });
    return NextResponse.json({ ok: true, ledger }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = text(body?.action).toLowerCase();
    const projectId = text(body?.projectId);
    const projectSlug = text(body?.projectSlug);
    const episodeProductionId = text(body?.episodeProductionId);
    const clientRequestId = text(body?.clientRequestId);
    const programFingerprintSha256 = text(body?.programFingerprintSha256);
    if (!body || !projectSlug || !episodeProductionId || !clientRequestId || !programFingerprintSha256 || !["set", "withdraw"].includes(action)) {
      return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_DECISION_INVALID_REQUEST", error: "Action, Nest, Episode, program fingerprint, and stable request identity are required." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const actor = { id: access.actor.id, email: access.actor.email };
    let result;
    if (action === "set") {
      const kind = text(body.kind) as EpisodeAudioDecisionKind;
      if (!text(body.assetId) || !text(body.sourceId) || !KINDS.has(kind) || !text(body.value)) {
        return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_DECISION_COORDINATES_REQUIRED", error: "Setting audio truth requires an exact track, decision kind, and value." }, { status: 400 });
      }
      result = await setEpisodeAudioTrackDecision({
        prisma,
        actor,
        projectSlug,
        episodeProductionId,
        assetId: text(body.assetId),
        sourceId: text(body.sourceId),
        kind,
        value: text(body.value),
        programFingerprintSha256,
        clientRequestId,
      });
    } else {
      if (!text(body.decisionId)) return NextResponse.json({ ok: false, code: "EPISODE_AUDIO_DECISION_ID_REQUIRED", error: "Withdrawing requires the exact active decision." }, { status: 400 });
      result = await withdrawEpisodeAudioTrackDecision({
        prisma,
        actor,
        projectSlug,
        episodeProductionId,
        decisionId: text(body.decisionId),
        programFingerprintSha256,
        clientRequestId,
        reason: text(body.reason),
      });
    }
    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
