/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({auth: jest.fn()}));
import {randomUUID} from "node:crypto";
import {getPrismaClient} from "@/lib/prisma";
import {readSessionRecordingShare} from "./session-recording-share";
import {readSessionRecordingAttempts} from "./session-recording-attempts";
import {selectSessionTranscriptSources} from "./session-transcript-source-selection";
import {assembleSessionTranscriptProgramClock} from "./session-transcript-assembly";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("A local test database is required.");
  process.env.DATABASE_URL = url;
}

(enabled ? describe : describe.skip)("Recording attempt persistence and access", () => {
  const prisma = getPrismaClient();
  const prefix = `recording-attempt-${randomUUID()}`;
  const id = (name: string) => `${prefix}-${name}`;
  const at = (seconds: number) => new Date(Date.parse("2026-09-09T12:00:00Z") + seconds * 1000);
  const starts = [randomUUID(), randomUUID()];
  const group = randomUUID();
  const actor = (name: string) => ({id: id(name), primaryEmail: `${id(name)}@example.test`, isStaff: false});

  beforeAll(async () => {
    await prisma.user.createMany({data: ["coach", "client", "outsider"].map(name => ({id: id(name), primaryEmail: actor(name).primaryEmail}))});
    await prisma.coachingBooking.create({data: {id: id("booking"), coachUserId: id("coach"), clientUserId: id("client"), scheduledStart: at(0), scheduledEnd: at(4000)}});
    await prisma.callRoom.create({data: {id: id("room"), captureGroupId: group, bookingId: id("booking"), createdByUserId: id("coach"), title: "Recording attempts"}});
    await prisma.callParticipant.createMany({data: ["coach", "client"].map(name => ({id: id(`${name}-participant`), roomId: id("room"), userId: id(name), displayName: name}))});
    for (const [index, directiveId] of starts.entries()) {
      await prisma.callRecordingDirective.create({data: {id: directiveId, requestId: randomUUID(), roomId: id("room"), captureGroupId: group,
        actorUserId: id("coach"), action: "START", requestSha256: "a".repeat(64), issuedAt: at(index * 3600)}});
    }
    // The first recording includes two people and a reconnect after 20 minutes.
    // A second explicit START in the same room must not inherit that timeline.
    for (let n = 0; n < 4; n++) {
      const person = n === 1 ? "client" : "coach";
      const participantId = id(`${person}-participant`);
      const captureId = randomUUID();
      await prisma.recordingAsset.create({data: {id: id(`source-${n}`), roomId: id("room"), participantId, kind: "LOCAL_AUDIO", status: "VERIFIED",
        contentType: "audio/webm", byteSize: 1000n, checksum: "b".repeat(64), storageBucket: "local-test", storageObjectPath: `${prefix}/${n}.webm`,
        recordedStartedAt: at([0, 1, 1200, 3600][n]!), recordedStoppedAt: at([1190, 1800, 1800, 3612][n]!),
        localManifestJson: {captureId, captureGroupId: group, exactBytesVerified: true}}});
      // Persist the actual endpoint acknowledgement, not the UI's RECORDING projection.
      await prisma.callRecordingEndpointReceipt.create({data: {id: randomUUID(), directiveId: starts[n === 3 ? 1 : 0]!, roomId: id("room"),
        participantId, actorUserId: id(person), clientInstanceId: `device-${n}`, clientKind: "BROWSER", deviceLabel: "Test browser",
        state: "STARTED", captureId, occurredAt: at([0, 1, 1200, 3600][n]!)}});
    }
  });

  afterAll(async () => {
    await prisma.callRoom.deleteMany({where: {id: id("room")}});
    await prisma.coachingBooking.deleteMany({where: {id: id("booking")}});
    await prisma.user.deleteMany({where: {id: {in: ["coach", "client", "outsider"].map(id)}}});
    await prisma.$disconnect();
  });

  it("opens the latest 12-second take, and retains the older multi-person reconnects", async () => {
    const before = await prisma.recordingAsset.findMany({where: {roomId: id("room")}, orderBy: {id: "asc"}});
    const latest = await readSessionRecordingShare(prisma, {roomId: id("room"), actor: actor("coach")});
    expect(latest.available.selectedTakeId).toBe(`start:${starts[1]}`);
    expect(latest.available.programDurationSeconds).toBe(12);
    expect(latest.available.sources.map(source => source.id)).toEqual([id("source-3")]);
    const earlier = await readSessionRecordingShare(prisma, {roomId: id("room"), actor: actor("coach"), takeId: `start:${starts[0]}`});
    expect(earlier.available.sources.map(source => source.id)).toEqual([0, 1, 2].map(n => id(`source-${n}`)));
    expect(earlier.available.programDurationSeconds).toBe(1800);
    expect(await prisma.recordingAsset.findMany({where: {roomId: id("room")}, orderBy: {id: "asc"}})).toEqual(before);
  });

  it("does not reveal private attempt metadata to the client or an uninvited user", async () => {
    const client = await readSessionRecordingShare(prisma, {roomId: id("room"), actor: actor("client"), takeId: `start:${starts[0]}`});
    expect(client.available.takes).toEqual([]);
    expect(client.available.sources).toEqual([]);
    expect(client.output).toBeNull();
    await expect(readSessionRecordingShare(prisma, {roomId: id("room"), actor: actor("outsider")})).rejects.toMatchObject({status: 404});
    await expect(readSessionRecordingShare(prisma, {roomId: id("room"), actor: actor("coach"), takeId: `start:${randomUUID()}`})).rejects.toMatchObject({status: 404});
  });

  it("uses persisted START receipts for transcript lanes and resets the later recording clock", async () => {
    const assets = await prisma.recordingAsset.findMany({where: {roomId: id("room")}, orderBy: {recordedStartedAt: "asc"}});
    const rows = assets.map(asset => ({...asset, recordedStartedAt: asset.recordedStartedAt!,
      transcriptJobs: [{id: `transcript-${asset.id}`, createdAt: asset.createdAt}]}));
    const attempts = await readSessionRecordingAttempts(prisma, id("room"), rows);
    const later = selectSessionTranscriptSources({rows, attempts, anchorRecordingAssetId: id("source-3")}).filter(row => row !== null);
    expect(later.map(row => row.id)).toEqual([id("source-3")]);
    const clock = assembleSessionTranscriptProgramClock(later.map(row => ({recordingAssetId: row.id,
      transcriptJobId: row.transcriptJobs[0]!.id, captureGroupId: group, recordedStartedAt: row.recordedStartedAt})));
    expect(clock.sources.map(row => row.programOffsetSeconds)).toEqual([0]);
    const earlier = selectSessionTranscriptSources({rows, attempts, anchorRecordingAssetId: id("source-0")}).filter(row => row !== null);
    expect(new Set(earlier.map(row => row.id))).toEqual(new Set([0, 1, 2].map(n => id(`source-${n}`))));
  });
});
