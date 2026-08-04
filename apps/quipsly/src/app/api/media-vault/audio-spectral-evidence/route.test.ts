/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { queueAudioSpectralEvidence, readAudioSpectralStatus, reconcileAudioSpectralEvidence } from "@/lib/server/audio-spectral-evidence";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-spectral-evidence", () => ({ queueAudioSpectralEvidence: jest.fn(), readAudioSpectralStatus: jest.fn(), reconcileAudioSpectralEvidence: jest.fn() }));

const allowed = { allowed: true, actor: { id: "editor_001", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" }, access: { allowed: true, projectId: "project_001", role: "EDITOR" } };
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset_audio_001", sourceId: "source_audio_001" };
function post(body: unknown) { return new NextRequest("http://localhost/api/media-vault/audio-spectral-evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("audio spectral evidence route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });

  it("requires project read access before revealing analysis metadata", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/audio-spectral-evidence?projectSlug=${coordinates.projectSlug}&assetId=${coordinates.assetId}`));
    expect(response.status).toBe(403);
    expect(readAudioSpectralStatus).not.toHaveBeenCalled();
  });

  it("fails closed before queueing a held source", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(423);
    expect(queueAudioSpectralEvidence).not.toHaveBeenCalled();
  });

  it("queues through the authorized actor without exposing storage coordinates", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueAudioSpectralEvidence).mockResolvedValue({ status: "queued", jobId: "audio_spectral_001" } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(queueAudioSpectralEvidence).toHaveBeenCalledWith({ prisma: {}, ...coordinates, actorEmail: "editor@example.test" });
    expect(JSON.stringify(await response.json())).not.toContain("locator");
  });

  it("reconciles only to immutable analysis evidence", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(reconcileAudioSpectralEvidence).mockResolvedValue({ status: "completed", boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, visualEvidenceIsNotAnEqDecision: true, repairCandidatesRequirePlaybackReview: true } } as never);
    const response = await POST(post({ ...coordinates, action: "reconcile" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, boundaries: { analysisDoesNotChangeMedia: true, repairCandidatesRequirePlaybackReview: true } });
  });
});
