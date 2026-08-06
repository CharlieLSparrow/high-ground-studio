/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  appendDialogueRepairAudition,
  appendDialogueRepairReview,
  createDialogueRepairCandidate,
  queueDialogueRepairExperiment,
  readDialogueRepairStatus,
  reconcileDialogueRepairExperiment,
} from "@/lib/server/dialogue-repair";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/dialogue-repair", () => ({
  DialogueRepairError: class DialogueRepairError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  appendDialogueRepairReview: jest.fn(),
  appendDialogueRepairAudition: jest.fn(),
  createDialogueRepairCandidate: jest.fn(),
  queueDialogueRepairExperiment: jest.fn(),
  readDialogueRepairStatus: jest.fn(),
  reconcileDialogueRepairExperiment: jest.fn(),
}));

const coordinates = {
  projectSlug: "high-ground-odyssey",
  assetId: "asset-audio-1",
  sourceId: "source-audio-1",
};
const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/dialogue-repair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(query: Record<string, string> = coordinates) {
  return new NextRequest(`http://localhost/api/media-vault/dialogue-repair?${new URLSearchParams(query)}`);
}

describe("dialogue repair route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects incomplete coordinates before authorization", async () => {
    const response = await POST(postRequest({ action: "create-candidate" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("keeps candidate evidence private from an ungranted account", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = await GET(getRequest());
    expect(response.status).toBe(403);
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(readDialogueRepairStatus).not.toHaveBeenCalled();
  });

  it("rechecks the exact protected source before writes", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(postRequest({ ...coordinates, action: "create-candidate", label: "mouth-click" }));
    expect(response.status).toBe(423);
    expect(createDialogueRepairCandidate).not.toHaveBeenCalled();
  });

  it("creates a human-marked candidate against normalized coordinates", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(createDialogueRepairCandidate).mockResolvedValue({ ok: true, idempotentReplay: false, candidate: { candidateId: "dialogue_candidate_1" } } as never);
    const response = await POST(postRequest({
      ...coordinates,
      action: "create-candidate",
      clientRequestId: "request-create-1",
      label: "mouth-click",
      startSeconds: 11.405,
      endSeconds: 11.435,
      auditionPreRollSeconds: 1.5,
      auditionPostRollSeconds: 1.5,
    }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createDialogueRepairCandidate).toHaveBeenCalledWith(expect.objectContaining({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      ...coordinates,
      clientRequestId: "request-create-1",
      label: "mouth-click",
      startSeconds: 11.405,
      endSeconds: 11.435,
    }));
  });

  it("appends review evidence without mutating the candidate", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendDialogueRepairReview).mockResolvedValue({ ok: true, idempotentReplay: false, receipt: { id: "dialogue_review_1" } } as never);
    const playbackEvidence = {
      schema: "quipsly-dialogue-repair-playback-evidence-v1",
      protectedPlaybackSourceId: coordinates.sourceId,
      listenedSecondBins: [10, 11, 12],
      auditionWindow: { startSeconds: 9.905, endSeconds: 12.935 },
      completedAt: "2026-08-05T20:00:00.000Z",
    };
    const response = await POST(postRequest({
      ...coordinates,
      action: "review-candidate",
      candidateId: "dialogue_candidate_1",
      clientRequestId: "request-review-1",
      decision: "confirmed",
      playbackEvidence,
      note: "Audible click at the marked source moment.",
    }));
    expect(response.status).toBe(200);
    expect(appendDialogueRepairReview).toHaveBeenCalledWith(expect.objectContaining({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      ...coordinates,
      candidateId: "dialogue_candidate_1",
      clientRequestId: "request-review-1",
      decision: "confirmed",
      playbackEvidence,
    }));
  });

  it("queues only through the confirmed candidate service boundary", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueDialogueRepairExperiment).mockResolvedValue({ ok: true, idempotentReplay: false, experiment: { jobId: "dialogue_repair_1", status: "queued" } } as never);
    const response = await POST(postRequest({ ...coordinates, action: "queue-experiment", candidateId: "dialogue_candidate_1" }));
    expect(response.status).toBe(202);
    expect(queueDialogueRepairExperiment).toHaveBeenCalledWith({ prisma: {}, actor: { id: actor.id, email: actor.email }, ...coordinates, candidateId: "dialogue_candidate_1" });
  });

  it("reconciles an exact job without treating the output as promoted media", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(reconcileDialogueRepairExperiment).mockResolvedValue({ ok: true, experiment: { jobId: "dialogue_repair_1", status: "completed", playbackUrl: "/api/ingest/media/dialogue-preview-1" } } as never);
    const response = await POST(postRequest({ ...coordinates, action: "reconcile-experiment", candidateId: "dialogue_candidate_1", jobId: "dialogue_repair_1" }));
    expect(response.status).toBe(200);
    expect(reconcileDialogueRepairExperiment).toHaveBeenCalledWith({ prisma: {}, ...coordinates, candidateId: "dialogue_candidate_1", jobId: "dialogue_repair_1" });
  });

  it("appends a matched A/B judgment without promoting the experiment", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendDialogueRepairAudition).mockResolvedValue({ ok: true, idempotentReplay: false, receipt: { id: "dialogue_audition_1", decision: "repair-preferred" } } as never);
    const playbackEvidence = {
      protectedPlaybackSourceId: coordinates.sourceId,
      protectedPlaybackJobId: "dialogue_repair_1",
      contextStartSeconds: 2.5,
      contextEndSeconds: 5.53,
      sourceListenedSecondBins: [2, 3, 4, 5],
      repairedListenedSecondBins: [2, 3, 4, 5],
      comparisonMode: "matched-loudness",
      completedAt: new Date().toISOString(),
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    };
    const response = await POST(postRequest({
      ...coordinates,
      action: "review-experiment",
      candidateId: "dialogue_candidate_1",
      jobId: "dialogue_repair_1",
      clientRequestId: "request-audition-1",
      decision: "repair-preferred",
      playbackEvidence,
      note: "The transient is gone without dulling the consonant.",
    }));
    expect(response.status).toBe(200);
    expect(appendDialogueRepairAudition).toHaveBeenCalledWith(expect.objectContaining({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      ...coordinates,
      candidateId: "dialogue_candidate_1",
      jobId: "dialogue_repair_1",
      decision: "repair-preferred",
      playbackEvidence,
    }));
  });

  it("returns a bounded service rejection instead of a generic server error", async () => {
    const { DialogueRepairError } = jest.requireMock("@/lib/server/dialogue-repair") as typeof import("@/lib/server/dialogue-repair");
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendDialogueRepairReview).mockRejectedValue(new DialogueRepairError("Listen to the entire protected context first.", 409, "DIALOGUE_REPAIR_REVIEW_INCOMPLETE"));
    const response = await POST(postRequest({ ...coordinates, action: "review-candidate", candidateId: "dialogue_candidate_1", clientRequestId: "request-review-2", decision: "confirmed", playbackEvidence: {} }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "DIALOGUE_REPAIR_REVIEW_INCOMPLETE", error: "Listen to the entire protected context first." });
  });
});
