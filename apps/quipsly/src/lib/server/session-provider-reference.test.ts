import { sessionProviderReferenceBinding } from "./session-provider-reference";

function asset() {
  return {
    id: "provider_reference_asset_123",
    roomId: "room_provider_reference_123",
    kind: "SERVER_MIX",
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-25T18:31:00.000Z"),
    recordedStartedAt: new Date("2026-08-25T18:00:00.000Z"),
    durationSeconds: 1_800,
    contentType: "audio/ogg",
    byteSize: BigInt(12_000_000),
    checksum: "a".repeat(64),
    storageBucket: "quipsly-media",
    storageObjectPath:
      "media-vault/recordings/livekit/room/commands/request-room-reference.ogg",
    localManifestJson: {
      schema: "quipsly-provider-recording-command-v1",
      source: "provider-recording-command-reservation",
      provider: "livekit",
      captureGroupId: "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82",
      providerRecordingMode: "audio-reference",
      providerRecordingIsOptionalWitness: true,
      localProtectedMastersRemainAuthoritative: true,
      providerProcessingDisposition: "RELEASED",
      exactBytesVerified: true,
      storageGeneration: "92831",
      verification: {
        status: "verified",
        storageBucket: "quipsly-media",
        storageObjectPath:
          "media-vault/recordings/livekit/room/commands/request-room-reference.ogg",
        exactGenerationRead: true,
        sha256: "a".repeat(64),
        metadata: { generation: "92831", size: "12000000" },
      },
    },
  };
}

describe("Session provider reference binding", () => {
  it("binds a consent-released exact GCS generation without promoting it to participant master", () => {
    expect(
      sessionProviderReferenceBinding({
        roomId: "room_provider_reference_123",
        captureGroupId: "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82",
        asset: asset(),
      }),
    ).toMatchObject({
      mode: "audio-reference",
      source: {
        provider: "gcs",
        generation: "92831",
        sha256: "a".repeat(64),
      },
      boundaries: {
        participantMastersRemainAuthoritative: true,
        referenceCannotReplaceParticipantMaster: true,
      },
    });
  });

  it.each([
    ["changed hash", { checksum: "b".repeat(64) }],
    ["changed room", { roomId: "another_room" }],
    [
      "missing exact generation read",
      {
        localManifestJson: {
          ...asset().localManifestJson,
          verification: {
            ...asset().localManifestJson.verification,
            exactGenerationRead: false,
          },
        },
      },
    ],
  ])("rejects %s", (_label, change) => {
    expect(
      sessionProviderReferenceBinding({
        roomId: "room_provider_reference_123",
        captureGroupId: "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82",
        asset: { ...asset(), ...change },
      }),
    ).toBeNull();
  });
});
