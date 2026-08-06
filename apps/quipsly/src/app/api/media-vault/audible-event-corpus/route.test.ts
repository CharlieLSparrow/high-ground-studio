/** @jest-environment node */

import { NextRequest } from "next/server";

import { GET, POST } from "./route";
import { appendAudibleEventTruth, readAudibleEventCorpusStatus } from "@/lib/server/audible-event-corpus";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({}) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn(async () => ({ allowed: true, actor: { id: "actor-001", email: "editor@example.com", isStaff: false } })) }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn(async () => ({ allowed: true })) }));
jest.mock("@/lib/server/audible-event-corpus", () => ({
  AudibleEventCorpusError: class AudibleEventCorpusError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  appendAudibleEventTruth: jest.fn(),
  readAudibleEventCorpusStatus: jest.fn(),
}));

const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset-001", sourceId: "source-001" };

beforeEach(() => jest.clearAllMocks());

test("GET returns the private source and project qualification projection", async () => {
  jest.mocked(readAudibleEventCorpusStatus).mockResolvedValue({ available: true, sourceReceipts: [], projectQualification: { detector: null, activeReceiptCount: 0, supersededReceiptCount: 0, sourceCount: 0, metrics: [] }, boundaries: {} } as never);
  const query = new URLSearchParams(coordinates);
  const response = await GET(new NextRequest(`http://localhost/api/media-vault/audible-event-corpus?${query}`));
  expect(response.status).toBe(200);
  expect(readAudibleEventCorpusStatus).toHaveBeenCalledWith(expect.objectContaining(coordinates));
});

test("POST preserves independent range, workload, and playback evidence", async () => {
  jest.mocked(appendAudibleEventTruth).mockResolvedValue({ ok: true, receipt: { id: "truth-001" } } as never);
  const response = await POST(new NextRequest("http://localhost/api/media-vault/audible-event-corpus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...coordinates, action: "label-corpus-window", clientRequestId: "request-001", verdict: "positive", workload: "podcast", split: "retained-challenge", classificationIdentifier: "beep", displayLabel: "Beep", family: "capture", reviewStartSeconds: 0, reviewEndSeconds: 8, eventStartSeconds: 1, eventEndSeconds: 2, note: "Clearly audible beep.", playbackEvidence: { protectedPlaybackSourceId: "source-001", contextStartSeconds: 0, contextEndSeconds: 8, listenedSecondBins: [0, 1, 2, 3, 4, 5, 6, 7], clientTrackedPlaybackIsNotProofOfAudibility: true } }) }));
  expect(response.status).toBe(200);
  expect(appendAudibleEventTruth).toHaveBeenCalledWith(expect.objectContaining({ ...coordinates, verdict: "positive", workload: "podcast", split: "retained-challenge", classificationIdentifier: "beep", reviewStartSeconds: 0, reviewEndSeconds: 8, eventStartSeconds: 1, eventEndSeconds: 2 }));
});

test("POST rejects unrelated actions before mutation", async () => {
  const response = await POST(new NextRequest("http://localhost/api/media-vault/audible-event-corpus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...coordinates, action: "qualify-detector" }) }));
  expect(response.status).toBe(400);
  expect(appendAudibleEventTruth).not.toHaveBeenCalled();
});
