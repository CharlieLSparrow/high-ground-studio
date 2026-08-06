/** @jest-environment node */

import { NextRequest } from "next/server";

const access = jest.fn();
const read = jest.fn();
const queue = jest.fn();
const reconcile = jest.fn();
const queueWaveforms = jest.fn();
const reconcileWaveforms = jest.fn();

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-mix", () => ({
  EpisodeAudioMixError: class EpisodeAudioMixError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  readEpisodeAudioMix: (...args: unknown[]) => read(...args),
  queueEpisodeAudioMix: (...args: unknown[]) => queue(...args),
  reconcileEpisodeAudioMix: (...args: unknown[]) => reconcile(...args),
  queueEpisodeAudioMixWaveformReview: (...args: unknown[]) => queueWaveforms(...args),
  reconcileEpisodeAudioMixWaveformReview: (...args: unknown[]) => reconcileWaveforms(...args),
}));

import { GET, POST } from "./route";

const status = { jobId: "mix_0001", status: "queued", proposalId: "mix_0001", programFingerprintSha256: "f".repeat(64), actionCount: 1, unresolvedCount: 0, preview: null, error: null, updatedAt: null, boundaries: { sourceTracksRemainImmutable: true, automationIsProposalNotTimelineMutation: true, previewIsUnpromoted: true, playbackApprovalRequired: true } };

describe("Episode audio mix route", () => {
  beforeEach(() => { jest.clearAllMocks(); access.mockResolvedValue({ allowed: true, actor: { id: "actor_0001", email: "editor@example.test" } }); read.mockResolvedValue(status); queue.mockResolvedValue(status); reconcile.mockResolvedValue({ ...status, status: "completed" }); queueWaveforms.mockResolvedValue({ ...status, status: "completed", waveformReview: { status: "queued" } }); reconcileWaveforms.mockResolvedValue({ ...status, status: "completed", waveformReview: { status: "completed" } }); });
  it("requires authenticated Episode read access", async () => { const response = await GET(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix?projectSlug=nest-one&episodeProductionId=episode-one")); expect(response.status).toBe(200); expect(access).toHaveBeenCalledWith(expect.objectContaining({ action: "read", projectSlug: "nest-one" })); expect(read).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: "nest-one", episodeProductionId: "episode-one" })); });
  it("queues only through write access and returns accepted", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix", { method: "POST", body: JSON.stringify({ operation: "queue", projectSlug: "nest-one", episodeProductionId: "episode-one" }), headers: { "content-type": "application/json" } })); expect(response.status).toBe(202); expect(access).toHaveBeenCalledWith(expect.objectContaining({ action: "write" })); expect(queue).toHaveBeenCalledWith(expect.objectContaining({ actorEmail: "editor@example.test" })); });
  it("binds waveform analysis to the exact completed mix job", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix", { method: "POST", body: JSON.stringify({ operation: "queue-waveforms", projectSlug: "nest-one", episodeProductionId: "episode-one", jobId: "mix_0001" }), headers: { "content-type": "application/json" } })); expect(response.status).toBe(200); expect(queueWaveforms).toHaveBeenCalledWith(expect.objectContaining({ jobId: "mix_0001", actorEmail: "editor@example.test" })); });
  it("rejects waveform analysis without an exact mix job", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix", { method: "POST", body: JSON.stringify({ operation: "queue-waveforms", projectSlug: "nest-one", episodeProductionId: "episode-one" }), headers: { "content-type": "application/json" } })); expect(response.status).toBe(400); expect(queueWaveforms).not.toHaveBeenCalled(); });
  it("rejects undeclared operations", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix", { method: "POST", body: JSON.stringify({ operation: "promote", projectSlug: "nest-one", episodeProductionId: "episode-one" }), headers: { "content-type": "application/json" } })); expect(response.status).toBe(400); expect(queue).not.toHaveBeenCalled(); });
});
