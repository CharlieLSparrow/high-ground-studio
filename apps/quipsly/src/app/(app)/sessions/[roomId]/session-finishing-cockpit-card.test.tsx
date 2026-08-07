/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";

import { SessionFinishingCockpitCard } from "./session-finishing-cockpit-card";
import { EMPTY_SESSION_READINESS_TOPOLOGY, type SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

const topology: SessionReadinessTopology = {
  ...EMPTY_SESSION_READINESS_TOPOLOGY,
  generatedAt: "2026-08-06T03:00:00.000Z",
  people: [{
    id: "participant-charlie",
    label: "Charlie Sparrow",
    role: "HOST",
    isCurrentActor: true,
    consent: "ready",
    videoConsent: true,
    transcriptionConsent: true,
    endpoints: [],
    preflights: [],
    endpointQueues: [],
    sources: [{
      id: "asset-mv7i",
      evidenceKind: "recording-asset",
      sourceKind: "audio",
      label: "Charlie MV7i master.wav",
      status: "VERIFIED",
      clientKind: "web",
      deviceLabel: "Mac browser · Shure MV7i",
      captureId: "capture-mv7i",
      startedAt: "2026-08-06T01:00:00.000Z",
      stoppedAt: "2026-08-06T01:42:00.000Z",
      durationSeconds: 2520,
      byteSize: "200000000",
      verified: true,
      serverRetention: {
        state: "SERVER_COPY_VERIFIED_RELEASED",
        uploadSessionId: "upload-mv7i",
        exactBytesVerified: true,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-06T02:00:00.000Z",
      },
    }],
    attentionCount: 0,
  }],
  expectedSources: [{
    id: "expected-mv7i",
    participantId: "participant-charlie",
    participantLabel: "Charlie Sparrow",
    label: "Charlie clean microphone master",
    sourceKind: "audio",
    retentionRole: "required-master",
    status: "active",
    expectedClientKind: "web",
    expectedDeviceLabel: "Shure MV7i",
    recordingAssetId: "asset-mv7i",
    captureId: "capture-mv7i",
    revision: 2,
    latestReason: null,
    fulfillment: "fulfilled",
    blocking: false,
    candidateSources: [],
    createdAt: "2026-08-06T00:30:00.000Z",
    updatedAt: "2026-08-06T02:00:00.000Z",
  }],
  exitReadiness: {
    ...EMPTY_SESSION_READINESS_TOPOLOGY.exitReadiness,
    state: "SAFE_TO_LEAVE",
    label: "Safe to leave every reconciled recording endpoint",
    detail: "Exact server masters and endpoint queues agree.",
    requiredSourceCount: 1,
    serverSafeRequiredSourceCount: 1,
    requiredPlannedSourceCount: 1,
    fulfilledRequiredPlannedSourceCount: 1,
    safeForPlannedSources: true,
    safeForServerObservedSources: true,
    allEndpointQueuesConfirmedEmpty: true,
    safeToLeaveAllEndpoints: true,
  },
};

const sourceEvidence: SessionSourceEvidence = {
  sources: [{
    recordingAssetId: "asset-mv7i",
    fileName: "Charlie MV7i master.wav",
    kind: "LOCAL_AUDIO",
    recordingStatus: "VERIFIED",
    status: "VERIFIED_MATCH",
    captureId: "capture-mv7i",
    captureGroupId: "capture-group-9",
    uploadSessionId: "upload-mv7i",
    startBoundary: { receiptId: "start-mv7i", occurredAt: "2026-08-06T01:00:00.000Z" },
    stopBoundary: { receiptId: "stop-mv7i", occurredAt: "2026-08-06T01:42:00.000Z" },
    sourceOrigin: "CAPTURE",
    cloud: { sha256: "a".repeat(64), byteSize: "200000000", generation: "9", bucket: "quipsly", objectPath: "capture.wav", verifiedAt: "2026-08-06T01:59:00.000Z" },
    captureRuntime: { appVersion: "1.0", appBuild: "28", deviceModel: "Mac", operatingSystem: "macOS", audioRoute: "Shure MV7i" },
    processingDisposition: "RELEASED",
    transcriptDisposition: "RELEASED",
    releaseAudit: { releasedAt: "2026-08-06T02:00:00.000Z", reason: "Exact source release verified by retained operation.", transcriptReleasedAt: "2026-08-06T02:00:00.000Z", transcriptReason: "Consent and bytes verified." },
    issues: [],
  }],
  counts: { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
};

describe("Session finishing cockpit card", () => {
  it("renders a calm source journey with expert identities available on demand", () => {
    render(<SessionFinishingCockpitCard
      roomId="episode-9-room"
      topology={topology}
      sourceEvidence={sourceEvidence}
      contentReadiness={{ status: "substantial", captureAssetCount: 1, substantialRecordingCount: 1 }}
      studioHandoff={{ recordings: [{ status: "ATTACHED" }] }}
      finishingEvidence={{
        transcriptJobs: [{ id: "transcript-mv7i", recordingAssetId: "asset-mv7i", status: "COMPLETED", segmentCount: 340, updatedAt: "2026-08-06T02:20:00.000Z" }],
        outputs: [],
        analyzedSourceCount: 1,
        assembly: {
          episodeProductionId: "episode-9",
          episodeTitle: "Episode 9",
          projectSlug: "high-ground-odyssey",
          episodeSlug: "episode-9",
          editorHref: "/editor?project=high-ground-odyssey&episode=episode-9",
          state: "MATERIALIZED_ASSEMBLY",
          captureGroupId: "capture-group-9",
          selectedMediaCount: 1,
          selectedRecordingAssetIds: ["asset-mv7i"],
          plannedSourceCount: 1,
          blockerCount: 0,
          warningCount: 0,
          nextAction: "Review current proposals.",
          canonicalTakeCount: 1,
          canonicalSourceCount: 1,
          canonicalAssemblyReadyCount: 1,
          sessionTimelineClipCount: 1,
          sessionTranscriptBlockCount: 340,
          episodeTimelineClipCount: 1,
          episodeTranscriptBlockCount: 340,
          currentProposalSetCount: 1,
          staleProposalSetCount: 0,
          currentReviewReceiptCount: 1,
          proofListenCount: 1,
          proofWatchCount: 1,
          localDraftActionCount: 0,
          unsavedLocalDraftActionCount: 0,
          canonicalTimelineSaveCount: 1,
          canonicallyLinkedDraftActionCount: 0,
          latestCanonicalSaveAt: "2026-08-06T02:30:00.000Z",
          ledgerAvailable: true,
          productionUpdatedAt: "2026-08-06T02:30:00.000Z",
        },
      }}
    />);

    const journey = screen.getByTestId("session-source-journey");
    expect(within(journey).getByRole("heading", { name: "What happened to each planned master" })).toBeInTheDocument();
    expect(within(journey).getByRole("heading", { name: "Charlie clean microphone master" })).toBeInTheDocument();
    expect(within(journey).getByText("Mac browser · Shure MV7i")).toBeInTheDocument();
    expect(within(journey).getByText("1 complete")).toBeInTheDocument();
    expect(within(journey).getByText(/Live call presence is intentionally not rewritten as historical proof/i)).toBeInTheDocument();
    expect(within(journey).getByText("expected-mv7i")).toBeInTheDocument();
    expect(within(journey).getByText("capture-mv7i")).toBeInTheDocument();
    expect(within(journey).getByText("asset-mv7i")).toBeInTheDocument();
    expect(within(journey).getByRole("list", { name: "Charlie clean microphone master source checkpoints" })).toBeInTheDocument();
  });

  it("routes an incomplete transcript checkpoint to its exact RecordingAsset", () => {
    render(<SessionFinishingCockpitCard
      roomId="episode-9-room"
      topology={topology}
      sourceEvidence={sourceEvidence}
      contentReadiness={{ status: "substantial", captureAssetCount: 1, substantialRecordingCount: 1 }}
      studioHandoff={{ recordings: [{ status: "ATTACHED" }] }}
      finishingEvidence={{
        transcriptJobs: [],
        outputs: [],
        analyzedSourceCount: 0,
        assembly: undefined,
      }}
    />);

    expect(screen.getByRole("link", { name: "Open this transcript" })).toHaveAttribute(
      "href",
      "/sessions/episode-9-room?mode=transcript&source=asset-mv7i",
    );
  });
});
