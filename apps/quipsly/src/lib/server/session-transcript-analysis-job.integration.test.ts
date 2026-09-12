/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { prepareSessionTranscriptAnalysis } from "./session-transcript-analysis-job";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";
import type { SessionAnalysisProvider, SessionAnalysisSource } from "./session-transcript-analysis";

jest.mock("server-only", () => ({}));
const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname))
    throw new Error("Analysis integration tests require an explicit loopback database.");
  process.env.DATABASE_URL = url;
}
const run = enabled ? describe : describe.skip;
run("source-bound session analysis persistence", () => {
  const prisma = getPrismaClient();
  const rooms: string[] = [];
  const sourceFor = async (): Promise<SessionAnalysisSource> => {
    const room = await prisma.callRoom.create({ data: { title: `Analysis QA ${randomUUID()}` } });
    rooms.push(room.id);
    return { roomId: room.id, purpose: "COACHING", segments: [{
      id: "source-1", transcriptJobId: "synthetic-job", recordingAssetId: "synthetic-asset",
      speakerLabel: "Client", text: "I will practice tomorrow.", startSeconds: 2, endSeconds: 7,
    }] };
  };
  const output = (source: SessionAnalysisSource) => JSON.stringify({ goals: [], notes: [], tasks: [{
    sourceId: source.segments[0]!.id, title: "Practice", excerpt: source.segments[0]!.text,
  }] });
  const provider = (generate: SessionAnalysisProvider["generate"]): SessionAnalysisProvider => ({ name: "synthetic", model: "fixture", generate });
  afterAll(async () => {
    if (rooms.length) await prisma.callRoom.deleteMany({ where: { id: { in: rooms } } });
    await prisma.$disconnect();
  });

  test("commits once, releases the room lock during model work, and reuses persisted analysis", async () => {
    const source = await sourceFor();
    const generate = jest.fn(async () => {
      await prisma.$transaction(async tx => {
        await acquirePrismaAdvisoryTransactionLock(tx, `capture-transcript-follow-through-room:${source.roomId}`);
      }, { timeout: 2_000 });
      return output(source);
    });
    const first = await prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(generate) });
    expect(first).toMatchObject({ status: "completed", reused: false });
    const second = await prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(generate) });
    expect(second).toMatchObject({ status: "completed", reused: true });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await prisma.sessionFollowThroughAnalysis.findUnique({ where: { roomId: source.roomId } }))
      .toMatchObject({ status: "completed", leaseId: null, leaseUntil: null, attemptCount: 1 });
  });

  test("concurrent callers share one in-flight model request", async () => {
    const source = await sourceFor();
    let finish!: (value: string) => void;
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const generate = jest.fn(() => { started(); return new Promise<string>(resolve => { finish = resolve; }); });
    const first = prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(generate) });
    await began;
    try {
      const second = await prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(generate) });
      expect(second.status).toBe("waiting");
      expect(generate).toHaveBeenCalledTimes(1);
    } finally { finish(output(source)); }
    expect((await first).status).toBe("completed");
  });

  test("read-side reconciliation cannot start a paid request or create an analysis job", async () => {
    const source = await sourceFor();
    const generate = jest.fn(async () => output(source));
    expect(await prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(generate), allowGeneration: false }))
      .toEqual({ status: "waiting" });
    expect(generate).not.toHaveBeenCalled();
    expect(await prisma.sessionFollowThroughAnalysis.findUnique({ where: { roomId: source.roomId } })).toBeNull();
  });

  test("a late expired attempt cannot overwrite the current transcript analysis", async () => {
    const source = await sourceFor();
    let finish!: (value: string) => void;
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const oldOutput = output(source);
    const first = prepareSessionTranscriptAnalysis({ prisma, source, provider: provider(() => {
      started(); return new Promise<string>(resolve => { finish = resolve; });
    }) });
    await began;
    try {
      await prisma.sessionFollowThroughAnalysis.update({ where: { roomId: source.roomId }, data: { leaseUntil: new Date(0) } });
      const changed = structuredClone(source);
      changed.segments[0]!.text = "I will practice next week.";
      const latest = await prepareSessionTranscriptAnalysis({ prisma, source: changed, provider: provider(async () => output(changed)) });
      expect(latest.status).toBe("completed");
      finish(oldOutput);
      expect((await first).status).toBe("waiting");
      const row = await prisma.sessionFollowThroughAnalysis.findUniqueOrThrow({ where: { roomId: source.roomId } });
      expect(JSON.stringify(row.resultJson)).toContain("I will practice next week.");
    } finally { finish(oldOutput); await first; }
  });

  test("failures back off, stop automatic paid retries after three attempts, and allow an explicit retry", async () => {
    const source = await sourceFor();
    let time = new Date();
    const generate = jest.fn(async () => { throw new Error("private provider diagnostic"); });
    const input = { prisma, source, provider: provider(generate), now: () => time };
    expect((await prepareSessionTranscriptAnalysis(input)).status).toBe("failed");
    expect((await prepareSessionTranscriptAnalysis(input)).status).toBe("waiting");
    expect(generate).toHaveBeenCalledTimes(1);
    for (let attempt = 0; attempt < 3; attempt++) {
      time = new Date(time.getTime() + 180_000);
      expect((await prepareSessionTranscriptAnalysis(input)).status).toBe("failed");
    }
    expect(generate).toHaveBeenCalledTimes(3);
    const row = await prisma.sessionFollowThroughAnalysis.findUniqueOrThrow({ where: { roomId: source.roomId } });
    expect(row.errorCode).toBe("PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(row)).not.toContain("private provider diagnostic");
    const retried = await prepareSessionTranscriptAnalysis({ ...input, retryFailed: true, provider: provider(async () => output(source)) });
    expect(retried.status).toBe("completed");
  });
});
