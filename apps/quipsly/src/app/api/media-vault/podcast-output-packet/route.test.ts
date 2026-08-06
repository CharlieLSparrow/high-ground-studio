/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { selectPodcastOutputPacket, withdrawPodcastOutputPacket } from "@/lib/server/podcast-output-packet";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/podcast-output-packet", () => ({
  PodcastOutputPacketError: class PodcastOutputPacketError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  selectPodcastOutputPacket: jest.fn(),
  withdrawPodcastOutputPacket: jest.fn(),
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/podcast-output-packet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const actor = { id: "producer-1", email: "producer@example.test", isStaff: false, name: "Producer", source: "session" };
const base = { action: "select", projectSlug: "high-ground-odyssey", episodeProductionId: "episode-9", assetId: "asset-1", deliveryJobId: "delivery-1", clientRequestId: "request-1", exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true };

describe("podcast Episode output packet route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects missing exact audio coordinates before authorization", async () => {
    const response = await POST(request({ ...base, assetId: "" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("selects only after Episode write access and forwards explicit boundaries", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(selectPodcastOutputPacket).mockResolvedValue({ ok: true, idempotentReplay: false, packet: { id: "packet-1" }, selection: { operation: "selected" } } as never);
    const response = await POST(request(base));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(selectPodcastOutputPacket).toHaveBeenCalledWith({ prisma: {}, actor: { id: actor.id, email: actor.email }, projectSlug: base.projectSlug, episodeProductionId: base.episodeProductionId, assetId: base.assetId, deliveryJobId: base.deliveryJobId, clientRequestId: base.clientRequestId, acknowledgements: { exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true } });
  });

  it("withdraws a selection without accepting a client-selected packet id", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "OWNER" } } as never);
    jest.mocked(withdrawPodcastOutputPacket).mockResolvedValue({ ok: true, idempotentReplay: true, packet: { id: "packet-1" }, selection: { operation: "withdrawn" } } as never);
    const response = await POST(request({ action: "withdraw", projectSlug: base.projectSlug, episodeProductionId: base.episodeProductionId, clientRequestId: "withdraw-1", reason: "Replace the mix", outputPacketId: "attacker-controlled" }));
    expect(response.status).toBe(200);
    expect(withdrawPodcastOutputPacket).toHaveBeenCalledWith({ prisma: {}, actor: { id: actor.id, email: actor.email }, projectSlug: base.projectSlug, episodeProductionId: base.episodeProductionId, clientRequestId: "withdraw-1", reason: "Replace the mix" });
  });
});
