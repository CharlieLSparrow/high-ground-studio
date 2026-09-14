/** @jest-environment node */
jest.mock("server-only", () => ({}));
import { readSessionRecordingShareTranscript } from "./session-recording-share";

function fixture(role: "coach" | "client" = "client") {
  const room = {id: "room", booking: {clientUserId: "client"}};
  const source = {id: "original", roomId: "room", checksum: "a".repeat(64), byteSize: 100,
    storageBucket: "vault", storageObjectPath: "original.wav", recordedStartedAt: new Date(0), recordedStoppedAt: new Date(10_000),
    localManifestJson: {exactBytesVerified: true, storageGeneration: "9"}, participant: {displayName: "Riley"}};
  const output = {id: "saved-output", title: "Edited session", bodyJson: {
    edit: {keptRanges: [{startSeconds: 5, endSeconds: 8}], joinCrossfadeSeconds: 0},
    render: {status: "VERIFIED", recordingAssetId: "mix", durationSeconds: 3, sha256: "b".repeat(64)},
  }, sourceManifestJson: {sources: [{recordingAssetId: source.id, sha256: source.checksum, generation: "9", bucketName: "vault", objectName: "original.wav", programOffsetSeconds: 5, includeInAudioMix: true},
    {recordingAssetId: "unused-camera", includeInAudioMix: false}]}};
  const client = {
    callRoom: {findFirst: jest.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(role === "coach" ? room : null)},
    sessionOutput: {findFirst: jest.fn().mockResolvedValue(output)},
    recordingAsset: {findMany: jest.fn().mockResolvedValue([source])},
    transcriptJob: {findMany: jest.fn().mockResolvedValue([{
      id: "job", assetId: source.id, sourceSha256: source.checksum, sourceGeneration: "9",
      processingManifestObject: "transcripts/job/manifest.json", processingResultObject: "transcripts/job/result.json",
      providerRequestId: "request", providerResponseObject: "transcripts/job/provider.json", workerBuildId: "worker", speakerAttributions: [],
      resultJson: {processingControl: {routing: {schema: "quipsly-transcript-routing-summary-v1", sourceTopology: "participant-isolated", participantLabel: "Riley", speakerAuthority: "source-binding", timingGranularity: "word", manifestBacked: true}}},
      segments: [{id: "retained", text: "Keep this", speakerLabel: "Riley", startSeconds: 0, endSeconds: 2, corrections: [], words: [
        {id: "word1", providerWordIndex: 0, word: "Keep", startSeconds: 0, endSeconds: 0.8},
        {id: "word2", providerWordIndex: 1, word: "this", startSeconds: 1, endSeconds: 2},
      ]}, {id: "cut", text: "Private removed words", speakerLabel: "Riley", startSeconds: 4, endSeconds: 5, corrections: [], words: []}],
    }])},
  };
  return {client, source, output, input: {roomId: "room", outputId: output.id, actor: {id: role, primaryEmail: `${role}@test.invalid`, isStaff: false}}};
}

it("uses saved program offsets and only sources included in the actual audio mix", async () => {
  const {client, input} = fixture();
  const result = await readSessionRecordingShareTranscript(client, input);
  expect(result.segments).toEqual([{text: "Keep this", speakerLabel: "Riley", startSeconds: 0, endSeconds: 2}]);
  expect(JSON.stringify(result)).not.toContain("Private removed words");
  expect(client.recordingAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({roomId: "room", id: {in: ["original"]}})}));
  expect(client.sessionOutput.findFirst).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({id: "saved-output", roomId: "room", recipientUserId: "client", status: "RELEASED"})}));
});

it("lets a coach export a verified private edit without granting clients draft access", async () => {
  const {client, input} = fixture("coach");
  expect((await readSessionRecordingShareTranscript(client, input)).segments).toHaveLength(1);
  expect(client.sessionOutput.findFirst.mock.calls[0][0].where).not.toHaveProperty("recipientUserId");
});

it("does not read source text if the recording is unshared, revoked, missing or outside access", async () => {
  const {client, input} = fixture();
  client.sessionOutput.findFirst.mockResolvedValue(null as never);
  await expect(readSessionRecordingShareTranscript(client, input)).rejects.toMatchObject({status: 404});
  expect(client.transcriptJob.findMany).not.toHaveBeenCalled();
  expect(client.recordingAsset.findMany).not.toHaveBeenCalled();
});

it.each(["checksum", "generation", "bucket", "offset"])("rejects changed saved source binding: %s", async field => {
  const {client, input, source, output} = fixture();
  if (field === "checksum") source.checksum = "c".repeat(64);
  if (field === "generation") source.localManifestJson.storageGeneration = "10";
  if (field === "bucket") source.storageBucket = "other-vault";
  if (field === "offset") output.sourceManifestJson.sources[0].programOffsetSeconds = Number.NaN;
  await expect(readSessionRecordingShareTranscript(client, input)).rejects.toMatchObject({status: 409});
  expect(client.transcriptJob.findMany).not.toHaveBeenCalled();
});

it("reports untranscribed audio without substituting another source or take", async () => {
  const {client, input} = fixture();
  client.transcriptJob.findMany.mockResolvedValue([]);
  expect(await readSessionRecordingShareTranscript(client, input)).toMatchObject({segments: [], untranscribedSources: 1});
});
