/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import { claimTranscriptFollowThroughCheck, runCaptureTranscriptFollowThroughMaintenance } from "./capture-transcript-follow-through-worker";

jest.mock("server-only", () => ({}));
jest.mock("./capture-transcript-follow-through", () => ({ reconcileCaptureTranscriptFollowThrough: jest.fn() }));
jest.mock("./capture-device-transcript-fallback-worker", () => ({
  runExpiredDeviceTranscriptFallbackMaintenance: jest.fn().mockResolvedValue({ scanned: 0 }),
}));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname))
    throw new Error("Maintenance integration tests require an explicit loopback database.");
  process.env.DATABASE_URL = url;
}
const run = enabled ? describe : describe.skip;

run("fair transcript follow-through maintenance persistence", () => {
  const prisma = getPrismaClient();
  const rooms: string[] = [];
  let jobs: string[] = [];
  const previousAI = process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED;

  // Real selection and writes, restricted to this test's disposable rows. Only
  // the processing boundary is mocked: no source media or paid provider calls.
  const scoped = {
    $executeRaw: prisma.$executeRaw.bind(prisma),
    transcriptJob: {
      findMany: (query: any) => prisma.transcriptJob.findMany({
        ...query, where: { AND: [query.where, { id: { in: jobs } }] },
      }),
    },
  };
  async function job(status: "COMPLETED" | "HELD" | "RUNNING", index: number) {
    const room = await prisma.callRoom.create({ data: { title: `Maintenance QA ${randomUUID()}` } });
    rooms.push(room.id);
    const value = await prisma.transcriptJob.create({ data: {
      room: { connect: { id: room.id } }, status, createdAt: new Date(1_000 + index), updatedAt: new Date(2_000 + index),
      asset: { create: { roomId: room.id, kind: "LOCAL_AUDIO", status: "VERIFIED" } },
      resultJson: { followThrough: { packetStatus: "waiting" }, preserved: "source evidence" },
    } });
    jobs.push(value.id);
    return value;
  }

  beforeEach(() => {
    jobs = [];
    jest.mocked(reconcileCaptureTranscriptFollowThrough).mockReset();
    jest.mocked(reconcileCaptureTranscriptFollowThrough).mockImplementation(async ({ transcriptJobId }) => ({
      transcriptJobId, transcriptStatus: "completed", packetStatus: "build-held",
      packetBuildId: null, reusedExistingPacket: false,
    }));
    process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED = "true";
  });
  afterAll(async () => {
    if (previousAI === undefined) delete process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED;
    else process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED = previousAI;
    if (rooms.length) {
      await prisma.transcriptJob.deleteMany({ where: { roomId: { in: rooms } } });
      await prisma.recordingAsset.deleteMany({ where: { roomId: { in: rooms } } });
      await prisma.callRoom.deleteMany({ where: { id: { in: rooms } } });
    }
    await prisma.$disconnect();
  });

  test("exhausted older sessions do not occupy every recovery pass ahead of new work", async () => {
    for (let index = 0; index < 4; index++) {
      const old = await job("COMPLETED", index);
      await prisma.sessionFollowThroughAnalysis.create({ data: {
        roomId: old.roomId!, sourceFingerprint: "synthetic", provider: "synthetic", model: "fixture",
        version: "fixture", status: "failed", attemptCount: 3, errorCode: "PROVIDER_UNAVAILABLE",
      } });
    }
    const latest = await job("COMPLETED", 5);
    for (let tick = 0; tick < 3; tick++) await runCaptureTranscriptFollowThroughMaintenance({ prisma: scoped, limit: 2 });
    const visited = jest.mocked(reconcileCaptureTranscriptFollowThrough).mock.calls.map(([input]) => input.transcriptJobId);
    expect(visited).toContain(latest.id);
    expect(new Set(visited).size).toBe(5);
    expect(await prisma.sessionFollowThroughAnalysis.count({ where: { roomId: { in: rooms }, attemptCount: 3 } })).toBe(4);
  });

  test("each status lane advances even when every attempted processor throws", async () => {
    for (const status of ["HELD", "RUNNING", "COMPLETED"] as const)
      for (let index = 0; index < 3; index++) await job(status, index);
    jest.mocked(reconcileCaptureTranscriptFollowThrough).mockRejectedValue(new Error("synthetic process exit"));
    for (let tick = 0; tick < 3; tick++) {
      expect(await runCaptureTranscriptFollowThroughMaintenance({ prisma: scoped, limit: 3 }))
        .toMatchObject({ scanned: 3, failed: 3 });
    }
    const visited = jest.mocked(reconcileCaptureTranscriptFollowThrough).mock.calls.map(([input]) => input.transcriptJobId);
    expect(new Set(visited)).toEqual(new Set(jobs));
  });

  test("a sweep does not edit transcript metadata, timestamps, status, or evidence", async () => {
    const original = await job("COMPLETED", 0);
    await runCaptureTranscriptFollowThroughMaintenance({ prisma: scoped, limit: 1 });
    const after = await prisma.transcriptJob.findUniqueOrThrow({ where: { id: original.id } });
    expect(after.followThroughCheckedAt).toBeInstanceOf(Date);
    expect({ ...after, followThroughCheckedAt: null }).toEqual(original);
  });

  test.each([1, 2])("a batch of %i does not permanently exclude held or completed work", async limit => {
    for (const status of ["RUNNING", "COMPLETED", "HELD"] as const) await job(status, 0);
    for (let tick = 0; tick < 3; tick++) await runCaptureTranscriptFollowThroughMaintenance({ prisma: scoped, limit });
    const visited = jest.mocked(reconcileCaptureTranscriptFollowThrough).mock.calls.map(([input]) => input.transcriptJobId);
    expect(new Set(visited)).toEqual(new Set(jobs));
  });

  test("two workers reading one snapshot claim it once, then a later sweep can recover it", async () => {
    const original = await job("COMPLETED", 0);
    const claims = await Promise.all([
      claimTranscriptFollowThroughCheck(prisma, original), claimTranscriptFollowThroughCheck(prisma, original),
    ]);
    expect(claims.sort()).toEqual([false, true]);
    const checked = await prisma.transcriptJob.findUniqueOrThrow({ where: { id: original.id } });
    // Simulate an exit after the claim: no reconcile call has happened. A new
    // worker reads the durable cursor and can continue without clearing a lock.
    expect(await claimTranscriptFollowThroughCheck(prisma, checked)).toBe(true);
    expect(await claimTranscriptFollowThroughCheck(prisma, checked)).toBe(false);
    const latest = await prisma.transcriptJob.findUniqueOrThrow({ where: { id: original.id } });
    expect(latest.followThroughCheckedAt!.getTime()).toBeGreaterThan(checked.followThroughCheckedAt!.getTime());
    expect(latest.updatedAt).toEqual(original.updatedAt);
  });

  test("a completed ready packet stays out of the recovery sweep", async () => {
    const ready = await job("COMPLETED", 0);
    await prisma.transcriptJob.update({ where: { id: ready.id }, data: {
      resultJson: { followThrough: { packetStatus: "ready" } },
    } });
    expect(await runCaptureTranscriptFollowThroughMaintenance({ prisma: scoped }))
      .toMatchObject({ scanned: 0, ready: 0 });
    expect(reconcileCaptureTranscriptFollowThrough).not.toHaveBeenCalled();
  });
});
