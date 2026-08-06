/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  readEpisodeAudioTrackDecisions,
  setEpisodeAudioTrackDecision,
  withdrawEpisodeAudioTrackDecision,
} from "@/lib/server/episode-audio-track-decisions";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/episode-audio-track-decisions", () => ({
  EpisodeAudioTrackDecisionError: class EpisodeAudioTrackDecisionError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  readEpisodeAudioTrackDecisions: jest.fn(),
  setEpisodeAudioTrackDecision: jest.fn(),
  withdrawEpisodeAudioTrackDecision: jest.fn(),
}));

const actor = { id: "editor-1", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" };
const base = {
  projectId: "project-1",
  projectSlug: "high-ground-odyssey",
  episodeProductionId: "episode-9",
  programFingerprintSha256: "f".repeat(64),
};

function post(body: unknown) {
  return new NextRequest("http://local.test/api/media-vault/episode-audio-program/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("episode audio program decisions route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects incomplete writes before authorization", async () => {
    const response = await POST(post({ action: "set" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("keeps the decision ledger private from an ungranted account", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied." } as never);
    const response = await GET(new NextRequest(`http://local.test/api/media-vault/episode-audio-program/decisions?${new URLSearchParams(base)}`));
    expect(response.status).toBe(403);
    expect(readEpisodeAudioTrackDecisions).not.toHaveBeenCalled();
  });

  it("records an exact source-bound decision through write authorization", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { projectId: base.projectId, role: "EDITOR" } } as never);
    jest.mocked(setEpisodeAudioTrackDecision).mockResolvedValue({ ok: true, idempotentReplay: false, decision: { id: "decision-1" }, ledger: {} } as never);
    const response = await POST(post({
      ...base,
      action: "set",
      clientRequestId: "request-1",
      assetId: "asset-a",
      sourceId: "source-a",
      kind: "track-role",
      value: "dialogue-primary",
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setEpisodeAudioTrackDecision).toHaveBeenCalledWith({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      projectSlug: base.projectSlug,
      episodeProductionId: base.episodeProductionId,
      programFingerprintSha256: base.programFingerprintSha256,
      clientRequestId: "request-1",
      assetId: "asset-a",
      sourceId: "source-a",
      kind: "track-role",
      value: "dialogue-primary",
    });
  });

  it("withdraws only the exact active receipt with a reason", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { projectId: base.projectId, role: "EDITOR" } } as never);
    jest.mocked(withdrawEpisodeAudioTrackDecision).mockResolvedValue({ ok: true, idempotentReplay: true, decision: { id: "withdrawal-1" }, ledger: {} } as never);
    const response = await POST(post({
      ...base,
      action: "withdraw",
      clientRequestId: "request-2",
      decisionId: "decision-1",
      reason: "The reviewed assignment was incorrect.",
    }));

    expect(response.status).toBe(200);
    expect(withdrawEpisodeAudioTrackDecision).toHaveBeenCalledWith({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      projectSlug: base.projectSlug,
      episodeProductionId: base.episodeProductionId,
      programFingerprintSha256: base.programFingerprintSha256,
      clientRequestId: "request-2",
      decisionId: "decision-1",
      reason: "The reviewed assignment was incorrect.",
    });
  });
});
