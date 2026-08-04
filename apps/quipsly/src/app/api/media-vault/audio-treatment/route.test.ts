/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { queueAudioTreatment, readAudioTreatmentStatus, reconcileAudioTreatment } from "@/lib/server/audio-treatment";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-treatment", () => ({ queueAudioTreatment: jest.fn(), readAudioTreatmentStatus: jest.fn(), reconcileAudioTreatment: jest.fn() }));

const allowed = { allowed: true, actor: { id: "editor_001", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" }, access: { allowed: true, projectId: "project_001", role: "EDITOR" } };
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset_audio_001", sourceId: "source_audio_001" };
function post(body: unknown) { return new NextRequest("http://localhost/api/media-vault/audio-treatment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("audio treatment route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });

  it("rejects malformed requests before authorization", async () => {
    const response = await POST(post({ projectSlug: coordinates.projectSlug }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("requires project read access before revealing treatment evidence", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/audio-treatment?projectSlug=${coordinates.projectSlug}&assetId=${coordinates.assetId}`));
    expect(response.status).toBe(403);
    expect(readAudioTreatmentStatus).not.toHaveBeenCalled();
  });

  it("fails closed before queueing a held source", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(423);
    expect(queueAudioTreatment).not.toHaveBeenCalled();
  });

  it("queues through the authorized actor and keeps the response private", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueAudioTreatment).mockResolvedValue({ status: "queued", jobId: "audio_treatment_001" } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(queueAudioTreatment).toHaveBeenCalledWith({ prisma: {}, ...coordinates, actorEmail: "editor@example.test" });
  });

  it("reconcile never promotes or mistakes the experiment for a master", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(reconcileAudioTreatment).mockResolvedValue({ status: "completed", boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, explicitApprovalStillRequired: true } } as never);
    const response = await POST(post({ ...coordinates, action: "reconcile" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, boundaries: { outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, explicitApprovalStillRequired: true } });
  });
});
