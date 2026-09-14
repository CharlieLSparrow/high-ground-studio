/** @jest-environment node */
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { GET } from "./route";
import { loadSessionAfterCallWork } from "@/lib/server/session-after-call-work";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/session-after-call-work", () => ({ loadSessionAfterCallWork: jest.fn() }));
const actor = { id: "coach", primaryEmail: "coach@example.test", isStaff: false };
const findFirst = jest.fn();
const read = (roomId = "session") => GET(new Request(`http://localhost/api/sessions/${roomId}/after-call`), { params: Promise.resolve({ roomId }) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadSessionAfterCallWork).mockResolvedValue(null);
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as any);
  jest.mocked(getPrismaClient).mockReturnValue({ callRoom: { findFirst } } as any);
});

it("requires an authenticated account before querying session data", async () => {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
  expect((await read()).status).toBe(401);
  expect(getPrismaClient).not.toHaveBeenCalled();
});
it.each(["coach", "client", "outsider"])("applies canonical membership to the %s account", async id => {
  const user = { ...actor, id, primaryEmail: `${id}@example.test` };
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user } as any);
  findFirst.mockResolvedValue(id === "outsider" ? null : { id: "session", recordingAssets: [], transcriptJobs: [] });
  const response = await read();
  expect(response.status).toBe(id === "outsider" ? 404 : 200);
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: sessionAccessWhere("session", user) }));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns only availability, never filenames, source manifests, transcript bodies or identities", async () => {
  findFirst.mockResolvedValue({ id: "session", recordingAssets: [{ id: "phone", kind: "LOCAL_AUDIO", status: "VERIFIED", verifiedAt: new Date(),
    localManifestJson: { exactBytesVerified: true, privateMetadata: "secret" } }], transcriptJobs: [{ assetId: "phone", status: "COMPLETED", _count: { segments: 10 } }] });
  const response = await read();
  expect(await response.json()).toEqual({ ok: true, summary: { roomId: "session", recordings: { uploaded: 1, pending: 0, attention: 0 }, transcripts: { available: 1, processing: 0, attention: 0 }, transcriptSourceId: "phone", recordingSourceId: "phone", followThrough: null } });
});
it("reports a retryable failure without claiming that a database outage means no recordings", async () => {
  findFirst.mockRejectedValue(new Error("database credentials must not escape"));
  const response = await read();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("credentials");
});

it("summarizes the latest take without borrowing an earlier take's transcript or hiding its camera", async () => {
  const asset = (id: string, group: string, hour: number, status = "VERIFIED", kind = "LOCAL_AUDIO") => ({
    id, kind, status, participantId: "coach", verifiedAt: status === "VERIFIED" ? new Date() : null,
    recordedStartedAt: new Date(`2026-09-13T${hour}:00:00Z`), recordedStoppedAt: new Date(`2026-09-13T${hour}:01:00Z`),
    localManifestJson: {captureGroupId: group, exactBytesVerified: status === "VERIFIED"},
  });
  findFirst.mockResolvedValue({id: "session", recordingAssets: [asset("old", "old", 10),
    asset("new", "new", 11, "UPLOADING"), asset("camera", "new", 11, "VERIFIED", "LOCAL_VIDEO")],
    transcriptJobs: [{id: "old-job", createdAt: new Date(), assetId: "old", status: "COMPLETED", _count: {segments: 10}}]});
  expect((await (await read()).json()).summary).toEqual({roomId: "session",
    recordings: {uploaded: 1, pending: 1, attention: 0}, transcripts: {available: 0, processing: 0, attention: 0},
    transcriptSourceId: null, recordingSourceId: "new", otherRecordingCount: 1, followThrough: null});
  expect(loadSessionAfterCallWork).toHaveBeenCalledWith(expect.objectContaining({roomId: "session", actor, sourceIds: ["new"]}));
});
it("keeps media reachable when session work cannot refresh", async () => {
  findFirst.mockResolvedValue({id: "session", recordingAssets: [], transcriptJobs: []});
  jest.mocked(loadSessionAfterCallWork).mockRejectedValue(new Error("work read failed"));
  const result = await read();
  expect(result.status).toBe(200);
  expect((await result.json()).summary.followThrough).toBeNull();
});
it("rejects invalid identifiers without querying", async () => {
  expect((await read(" ")).status).toBe(400);
  expect(getPrismaClient).not.toHaveBeenCalled();
});
