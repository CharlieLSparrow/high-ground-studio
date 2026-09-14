/** @jest-environment node */
import { GET } from "./route";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionTranscriptCorrectionDesk } from "@/lib/server/session-transcript-correction-desk";
import { TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
jest.mock("@/lib/prisma", () => ({getPrismaClient: () => ({})}));
jest.mock("@/lib/server/quipsly-session", () => ({getQuipslySessionFromRequest: jest.fn()}));
jest.mock("@/lib/server/session-transcript-correction-desk", () => ({readSessionTranscriptCorrectionDesk: jest.fn()}));
const run = (query = "") => GET(new Request(`http://localhost/api/sessions/room-1/transcript-export${query}`), {params: Promise.resolve({roomId: "room-1"})});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: {id: "client", primaryEmail: "client@dev.test", isStaff: false}} as never);
  jest.mocked(readSessionTranscriptCorrectionDesk).mockResolvedValue({roomTitle: "Chapter coaching", gate: {allowed: true}, segments: [{text: "Corrected text", speakerLabel: "Riley", startSeconds: 2, endSeconds: 4, programStartSeconds: 12, programEndSeconds: 14}]} as never);
});
it("requires authentication before reading any transcript", async () => {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
  expect((await run()).status).toBe(401);
  expect(readSessionTranscriptCorrectionDesk).not.toHaveBeenCalled();
});
it("uses the canonical scoped Session reader, including an explicitly chosen source", async () => {
  const response = await run("?format=srt&recordingAssetId=asset-1&transcriptJobId=job-1");
  expect(readSessionTranscriptCorrectionDesk).toHaveBeenCalledWith(expect.objectContaining({roomId: "room-1", actor: {id: "client", email: "client@dev.test", isStaff: false}, recordingAssetId: "asset-1", transcriptJobId: "job-1"}));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain("chapter-coaching-transcript.srt");
  expect(await response.text()).toContain("00:00:12,000 --> 00:00:14,000\nRiley: Corrected text");
});
it("propagates membership or source-isolation denial without transcript content", async () => {
  jest.mocked(readSessionTranscriptCorrectionDesk).mockRejectedValue(new TranscriptCorrectionError("Not found", 404, "NOT_FOUND"));
  const response = await run();
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("Corrected text");
});
it("supports plain paragraphs and rejects unsupported formats", async () => {
  expect(await (await run("?speakers=false&timestamps=false")).text()).toBe("Chapter coaching\n\nCorrected text\n");
  expect((await run("?format=html")).status).toBe(400);
});
it.each(["incomplete", "held"])("exports available conversation text without hiding that the session is %s", async status => {
  jest.mocked(readSessionTranscriptCorrectionDesk).mockResolvedValue({roomTitle: "Coaching", gate: {allowed: true},
    sessionTranscript: {status, pendingSourceCount: 1}, segments: [{text: "Available words", speakerLabel: "Riley", startSeconds: 0, endSeconds: 2}]} as never);
  const response = await run();
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Quipsly-Transcript-Completeness")).toBe("partial");
  expect(response.headers.get("content-disposition")).toContain("coaching-partial-transcript.txt");
  expect(await response.text()).toContain("Partial transcript: some participant recordings are not included yet.");
  const subtitle = await run("?format=srt");
  expect(subtitle.status).toBe(200);
  expect(subtitle.headers.get("content-disposition")).toContain("coaching-partial-transcript.srt");
  expect(await subtitle.text()).toMatch(/^1\n00:00:00,000 --> 00:00:02,000\nRiley: Available words/);
});

it("does not bypass an unavailable transcript boundary", async () => {
  jest.mocked(readSessionTranscriptCorrectionDesk).mockResolvedValue({gate: {allowed: false}, segments: []} as never);
  expect((await run()).status).toBe(409);
});
