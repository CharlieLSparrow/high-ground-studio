import { buildQuipslyProviderRecordingReceiptSlotManifest } from "@high-ground/quipsly-domain/coaching-meeting-spine";

describe("provider recording evidence", () => {
  it("carries the room capture group without claiming that provider media owns sync", () => {
    const manifest = buildQuipslyProviderRecordingReceiptSlotManifest({
      provider: "livekit",
      providerRoomId: "provider-room-9",
      callRoomId: "room-9",
      captureGroupId: "take-9",
      preparedAt: "2026-08-05T05:00:00.000Z",
      preparedByUserId: "operator-1",
    });

    expect(manifest).toMatchObject({
      callRoomId: "room-9",
      captureGroupId: "take-9",
      startsWithJoin: false,
      externalRecordingStarted: false,
      requiresExplicitStart: true,
      currentStatus: "receipt-slot",
    });
    expect(manifest).not.toHaveProperty("sampleAccurateClaimed", true);
  });
});
