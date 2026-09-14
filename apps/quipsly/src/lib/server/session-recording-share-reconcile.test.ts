/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@high-ground/quipsly-media-processing", () => ({
  ...jest.requireActual("@high-ground/quipsly-media-processing"),
  parseSessionRecordingShareJob: (value: unknown) => value,
  parseSessionRecordingShareResult: (value: unknown) => value,
}));

import { readSessionRecordingShare } from "./session-recording-share";

describe("recording render reconciliation transaction", () => {
  function database(wins: boolean) {
    const operations: string[] = [];
    const output = {id: "output", roomId: "room", status: "DRAFT", revision: 1, createdByUserId: "coach",
      bodyJson: {render: {status: "PROCESSING", jobId: "job", sourceOutputRevision: 1}}};
    const room = {id: "room", captureGroupId: "group", booking: {clientUserId: "client", clientUser: {id: "client"}}};
    const tx = {
      sessionOutput: {
        updateMany: jest.fn(async () => {operations.push("claim-revision"); return {count: wins ? 1 : 0};}),
        findUnique: jest.fn(async () => {operations.push("read-output"); return null;}),
      },
      recordingAsset: {upsert: jest.fn(async ({create}) => {operations.push("create-asset"); return {id: create.id};})},
      sessionOutputRevision: {create: jest.fn(async () => {operations.push("record-revision");})},
    };
    const client = {
      callRoom: {findFirst: jest.fn().mockResolvedValue(room)},
      sessionOutput: {findFirst: jest.fn().mockResolvedValue(output)},
      recordingAsset: {findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([])},
      callRecordingEndpointReceipt: {findMany: jest.fn().mockResolvedValue([])},
      transcriptJob: {findMany: jest.fn().mockResolvedValue([])},
      studioWorkflowJob: {findUnique: jest.fn().mockResolvedValue({id: "job", status: "completed",
        inputJson: {target: {provider: "local"}, sourceSetSha256: "a".repeat(64)},
        resultJson: {jobId: "job", roomId: "room", outputId: "output", outputRevision: 1, sourceSetSha256: "a".repeat(64),
          output: {provider: "local", bucketName: "local", objectName: "output.m4a", generation: "1", sha256: "b".repeat(64), sizeBytes: 1234, durationSeconds: 10, mediaKind: "audio", contentType: "audio/mp4"},
          completedAt: "2026-09-13T12:00:00Z", sourceRecordingAssetIds: ["source"], edit: {}, worker: {}},
      })},
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(tx)),
    };
    return {client, tx, operations};
  }

  it("claims the revision before creating an asset, within the same transaction", async () => {
    const {client, tx, operations} = database(true);
    await readSessionRecordingShare(client, {roomId: "room", actor: {id: "coach", primaryEmail: "coach@example.test", isStaff: false}});
    expect(operations).toEqual(["claim-revision", "create-asset", "record-revision", "read-output"]);
    const saved = tx.sessionOutput.updateMany.mock.calls[0] as unknown as [{data: {bodyJson: {render: {recordingAssetId: string}}}}];
    expect(saved[0].data.bodyJson.render.recordingAssetId).toBe(tx.recordingAsset.upsert.mock.calls[0]![0].create.id);
  });

  it("a losing reader returns the winner without racing an asset insert or writing another revision", async () => {
    const {client, tx, operations} = database(false);
    await readSessionRecordingShare(client, {roomId: "room", actor: {id: "coach", primaryEmail: "coach@example.test", isStaff: false}});
    expect(operations).toEqual(["claim-revision", "read-output"]);
    expect(tx.recordingAsset.upsert).not.toHaveBeenCalled();
    expect(tx.sessionOutputRevision.create).not.toHaveBeenCalled();
  });
});
