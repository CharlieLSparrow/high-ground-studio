/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { queueEpisodeProgramDelivery, readEpisodeProgramDeliveryStatus } from "@/lib/server/episode-program-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/episode-program-delivery", () => ({
  EpisodeProgramDeliveryError: class EpisodeProgramDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  queueEpisodeProgramDelivery: jest.fn(), readEpisodeProgramDeliveryStatus: jest.fn(), reconcileEpisodeProgramDelivery: jest.fn(),
}));

const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };
const allowed = { allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } };
const coordinates = { projectSlug: "high-ground-odyssey", episodeProductionId: "episode-9", mixJobId: "episode-mix-job-1" };
function request(body: unknown) { return new NextRequest("http://localhost/api/media-vault/episode-audio-program/delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("Episode program delivery route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });
  it("requires Episode read access before revealing encoded output", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied." } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/episode-audio-program/delivery?projectSlug=${coordinates.projectSlug}&episodeProductionId=${coordinates.episodeProductionId}`));
    expect(response.status).toBe(403); expect(readEpisodeProgramDeliveryStatus).not.toHaveBeenCalled();
  });
  it("queues only the exact promoted Episode mix job", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(queueEpisodeProgramDelivery).mockResolvedValue({ status: "queued", jobId: "episode-program-delivery-1" } as never);
    const response = await POST(request({ operation: "queue", ...coordinates }));
    expect(response.status).toBe(202);
    expect(queueEpisodeProgramDelivery).toHaveBeenCalledWith({ prisma: {}, ...coordinates, actorEmail: actor.email });
  });
});
