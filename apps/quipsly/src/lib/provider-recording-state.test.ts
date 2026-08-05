import { projectProviderRecordingState } from "./provider-recording-state";

describe("projectProviderRecordingState", () => {
  it("keeps provider-off explicitly independent from capture-group sync", () => {
    expect(projectProviderRecordingState({ metadataJson: {}, recordingAssets: [], providerRecordingCommands: [] })).toMatchObject({
      state: "off",
      nextAction: expect.stringContaining("does not affect capture-group timing"),
    });
  });

  it("prioritizes an active bound START over older held commands", () => {
    expect(projectProviderRecordingState({
      metadataJson: { activeProviderRecordingCommandId: "start-1", activeLiveKitEgressId: "egress-1" },
      recordingAssets: [],
      providerRecordingCommands: [
        { id: "held-2", action: "START", status: "HELD", errorMessage: "older hold" },
        { id: "start-1", action: "START", status: "APPLIED", providerEgressId: "egress-1" },
      ],
    })).toMatchObject({ state: "recording", activeStart: { id: "start-1" } });
  });

  it("exposes an uncertain command instead of offering another START", () => {
    expect(projectProviderRecordingState({
      metadataJson: {},
      recordingAssets: [],
      providerRecordingCommands: [
        { id: "uncertain-1", action: "START", status: "RECONCILE_REQUIRED" },
      ],
    })).toMatchObject({
      state: "needs-review",
      unresolved: { id: "uncertain-1" },
      nextAction: expect.stringContaining("Do not issue a new START"),
    });
  });

  it("keeps a provider media failure visible after an end webhook clears active metadata", () => {
    expect(projectProviderRecordingState({
      metadataJson: { activeProviderRecordingCommandId: null, activeLiveKitEgressId: null },
      recordingAssets: [{
        id: "provider-asset-1",
        kind: "SERVER_MIX",
        status: "HELD",
        localManifestJson: { source: "provider-recording-command-reservation" },
      }],
      providerRecordingCommands: [
        { id: "start-1", action: "START", status: "APPLIED", errorCode: "PROVIDER_EGRESS_ENDED_WITH_ERROR" },
      ],
    })).toMatchObject({
      state: "held",
      heldAsset: { id: "provider-asset-1" },
    });
  });
});
