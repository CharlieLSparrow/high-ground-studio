/** @jest-environment node */

import { NextRequest } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { queueAudioDelivery, readAudioDeliveryStatus } from "@/lib/server/audio-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-delivery", () => ({
  AudioDeliveryError: class AudioDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  queueAudioDelivery: jest.fn(), readAudioDeliveryStatus: jest.fn(), reconcileAudioDelivery: jest.fn(),
}));

const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };
const allowed = { allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } };
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset-audio-1", sourceId: "source-audio-1", masteryJobId: "audio-mastery-job-1" };
function request(body: unknown) { return new NextRequest("http://localhost/api/media-vault/audio-delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("audio delivery route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });
  it("requires project read access before revealing artifacts", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/audio-delivery?projectSlug=${coordinates.projectSlug}&assetId=${coordinates.assetId}`));
    expect(response.status).toBe(403); expect(readAudioDeliveryStatus).not.toHaveBeenCalled();
  });
  it("fails closed before encoding a held source", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(request(coordinates));
    expect(response.status).toBe(423); expect(queueAudioDelivery).not.toHaveBeenCalled();
  });
  it("queues the exact promoted mastery job and private delivery profile", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueAudioDelivery).mockResolvedValue({ status: "queued", jobId: "audio-delivery-job-1" } as never);
    const response = await POST(request(coordinates));
    expect(response.status).toBe(202); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(queueAudioDelivery).toHaveBeenCalledWith({ prisma: {}, ...coordinates, actorEmail: actor.email, profileId: "apple-podcasts-aac-stereo-v1" });
  });
});
