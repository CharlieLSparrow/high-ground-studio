/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { attachRecordingSoundAnalysis, readRecordingSoundAnalyses } from "./recording-sound-analysis";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("A local test database is required.");
  process.env.DATABASE_URL = url;
}

(enabled ? describe : describe.skip)("Post-upload device sound analysis", () => {
  const prisma = getPrismaClient();
  const prefix = `sound-sync-${randomUUID()}`;
  const id = (name: string) => `${prefix}-${name}`;
  const actor = (name: string) => ({ id: id(name), primaryEmail: `${id(name)}@example.test` });
  const sha = "b".repeat(64);
  const analysis = {
    schemaVersion: 1, analysisId: id("analysis"), supersedesAnalysisId: null, status: "completed",
    algorithm: "apple-sound-classifier-file-v1", classifierIdentifier: "SNClassifierIdentifierVersion1",
    analyzedAt: "2026-09-09T18:00:00Z", sourceSHA256: sha, sourceByteCount: 42000, durationSeconds: 10,
    requestedWindowDurationSeconds: 1.5, effectiveWindowDurationSeconds: 1.5, overlapFactor: 0.5,
    minimumCandidateConfidence: 0.35, knownClassificationCount: 300, knownClassificationsSHA256: "a".repeat(64),
    resultWindowCount: 12, suggestions: [], failureCode: null, failureDetail: null,
    boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true,
      noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
  };
  const submit = (name = "owner", value = analysis) => attachRecordingSoundAnalysis({
    prisma, actor: actor(name), recordingAssetId: id("recording"), analysis: value,
  });
  beforeAll(async () => {
    await prisma.user.createMany({ data: ["owner", "peer", "outsider"].map(name => ({ ...actor(name) })) });
    await prisma.studioWorkspace.create({ data: { id: id("workspace"), slug: id("workspace"), name: "Sound sync QA" } });
    await prisma.studioProject.create({ data: { id: id("project"), workspaceId: id("workspace"), slug: id("project"), name: "Sound sync QA" } });
    await prisma.callRoom.create({ data: { id: id("room"), title: "Sound sync QA", createdByUserId: id("owner"), projectId: id("project") } });
    await prisma.callParticipant.createMany({ data: ["owner", "peer"].map(name => ({ id: id(`${name}-participant`), roomId: id("room"), userId: id(name), displayName: name })) });
    await prisma.recordingAsset.create({ data: { id: id("recording"), roomId: id("room"), participantId: id("owner-participant"),
      kind: "LOCAL_AUDIO", status: "VERIFIED", verifiedAt: new Date(), byteSize: 42000n, checksum: sha,
      storageBucket: "retained-local-qa", storageObjectPath: `${prefix}/original.wav`, durationSeconds: 10,
      localManifestJson: { actorUserId: id("owner"), mediaAssetId: id("media"), sourceId: id("source"),
        reportedSourceProfile: { audioSignal: { algorithm: "retained-waveform" } }, unrelated: "keep" },
    } });
  });
  afterAll(async () => {
    await prisma.callRoom.deleteMany({ where: { id: id("room") } });
    await prisma.studioProject.deleteMany({ where: { id: id("project") } });
    await prisma.studioWorkspace.deleteMany({ where: { id: id("workspace") } });
    await prisma.user.deleteMany({ where: { id: { in: ["owner", "peer", "outsider"].map(id) } } });
    await prisma.$disconnect();
  });

  it("rejects a stranger and another participant even though the participant can enter the room", async () => {
    await expect(submit("outsider")).rejects.toMatchObject({ status: 404 });
    await expect(submit("peer")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a different source and unverified upload", async () => {
    await expect(submit("owner", { ...analysis, sourceSHA256: "c".repeat(64) })).rejects.toMatchObject({ status: 409 });
    await prisma.recordingAsset.update({ where: { id: id("recording") }, data: { status: "UPLOADED" } });
    await expect(submit()).rejects.toMatchObject({ status: 409 });
    await prisma.recordingAsset.update({ where: { id: id("recording") }, data: { status: "VERIFIED" } });
  });
  it("attaches after upload, replays a lost reply, and preserves waveform, source, and unrelated metadata", async () => {
    const before = await prisma.recordingAsset.findUniqueOrThrow({ where: { id: id("recording") } });
    expect(await submit()).toMatchObject({ ok: true, applied: true, analysisId: analysis.analysisId });
    expect(await submit()).toMatchObject({ ok: true, applied: false, analysisId: analysis.analysisId });
    const after = await prisma.recordingAsset.findUniqueOrThrow({ where: { id: id("recording") } });
    expect(after).toMatchObject({ status: before.status, checksum: before.checksum, storageBucket: before.storageBucket,
      storageObjectPath: before.storageObjectPath, byteSize: before.byteSize,
      localManifestJson: { unrelated: "keep", reportedSourceProfile: { audioSignal: { algorithm: "retained-waveform" },
        audibleEventAnalysis: { analysisId: analysis.analysisId } } } });
    const read = (projectId: string) => readRecordingSoundAnalyses({ prisma, projectId, assetId: id("media"),
      sourceId: id("source"), sha256: sha, sizeBytes: 42000 });
    expect((await read(id("project"))).map(row => row.analysisId)).toEqual([analysis.analysisId]);
    expect(await read(id("other-project"))).toEqual([]);
  });
  it("rejects same-id changes and acknowledges late older results without replacing current results", async () => {
    await expect(submit("owner", { ...analysis, resultWindowCount: 13 })).rejects.toMatchObject({ code: "ANALYSIS_ID_CONFLICT" });
    expect(await submit("owner", { ...analysis, analysisId: id("older"), analyzedAt: "2026-09-08T18:00:00Z" })).toMatchObject({ applied: false });
    const row = await prisma.recordingAsset.findUniqueOrThrow({ where: { id: id("recording") } });
    expect(row.localManifestJson).toMatchObject({ reportedSourceProfile: { audibleEventAnalysis: { analysisId: analysis.analysisId } } });
  });
  it("honors revoked room participation", async () => {
    await prisma.callRoom.update({ where: { id: id("room") }, data: { createdByUserId: id("peer") } });
    await prisma.callParticipant.update({ where: { id: id("owner-participant") }, data: { accessStatus: "REMOVED" } });
    await expect(submit()).rejects.toMatchObject({ status: 404 });
  });
});
