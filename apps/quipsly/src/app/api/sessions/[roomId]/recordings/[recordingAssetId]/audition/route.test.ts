/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { prepareSessionAudioAudition, reconcileSessionAudioAudition } from "@/lib/server/session-audio-audition";

import { GET, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/session-audio-audition", () => ({
  SessionAudioAuditionError: class SessionAudioAuditionError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  },
  prepareSessionAudioAudition: jest.fn(),
  reconcileSessionAudioAudition: jest.fn(),
}));

const roomId = "room-12345678";
const recordingAssetId = "recording-12345678";
const prisma = {};
const context = () => ({ params: Promise.resolve({ roomId, recordingAssetId }) });
const request = () => new Request(`https://nest.quipsly.com/api/sessions/${roomId}/recordings/${recordingAssetId}/audition`);

describe("Session audio audition control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "coach-12345678", primaryEmail: "coach@example.com" } } as never);
  });

  it("authenticates before queueing media work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(prepareSessionAudioAudition).not.toHaveBeenCalled();
  });

  it("queues one exact source-bound derivative from an explicit Play request", async () => {
    jest.mocked(prepareSessionAudioAudition).mockResolvedValue({ state: "QUEUED", recordingAssetId, jobId: "session_audition_12345678", reason: null, derivative: null });
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: "QUEUED", recordingAssetId });
    expect(prepareSessionAudioAudition).toHaveBeenCalledWith(expect.objectContaining({ prisma, roomId, recordingAssetId, actor: expect.objectContaining({ id: "coach-12345678" }) }));
  });

  it("polls without silently creating a missing job", async () => {
    jest.mocked(reconcileSessionAudioAudition).mockResolvedValue({ state: "HELD", recordingAssetId, jobId: "session_audition_12345678", reason: "Prepare first.", derivative: null });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: "HELD", reason: "Prepare first." });
    expect(prepareSessionAudioAudition).not.toHaveBeenCalled();
  });
});
