/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";

import { CaptureTakeMaterializationPanel } from "./CaptureTakeMaterializationPanel";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

it("explains an evidence update before offering the conflict-safe write", async () => {
  global.fetch = jest.fn().mockImplementation(() => jsonResponse({
    ok: true,
    episodeTitle: "Episode 9",
    productionUpdatedAt: "2026-08-06T19:00:00.000Z",
    captureGroupId: "take-9",
    selectedMediaCount: 2,
    sourceCount: 2,
    transcriptJobId: "transcript-backup",
    plan: {
      ok: true,
      status: "media-ready",
      roomId: "room-9",
      sourceSetFingerprintSha256: "a".repeat(64),
      sourceBindings: [
        { recordingAssetId: "audio-spine", mediaAssetId: "media-spine", trackId: "A2", participant: null, cameraPosition: null, alignmentReviewId: null },
        { recordingAssetId: "audio-backup", mediaAssetId: "media-backup", trackId: "A3", participant: null, cameraPosition: null, alignmentReviewId: "alignment-1" },
      ],
      transcriptBinding: { blockIds: ["turn-1", "turn-2", "turn-3", "turn-4"], speakerAttributionComplete: false, recordingAssetId: "audio-backup" },
      speakerCameraMappingIds: [],
      cameraReadiness: {
        status: "NO_VIDEO_SOURCES",
        videoSourceCount: 0,
        participantBoundVideoSourceCount: 0,
        unboundVideoSourceCount: 0,
        reviewedSpeakerCount: 1,
        attributedSpeakerCount: 0,
        mappedSpeakerCount: 0,
        participants: [],
        nextAction: "Add or recover at least one participant camera source for this take. Audio editing can continue.",
      },
      issues: [{ code: "speaker-attribution-incomplete", severity: "warning", message: "A speaker still needs playback-reviewed identity." }],
      nextAction: "Resolve the remaining speaker/camera review warnings before automated camera assembly.",
      changed: true,
      impact: {
        operation: "evidence-update",
        priorMaterializationStatus: "media-materialized",
        sourceLanesCreated: 0,
        sourceLanesReused: 2,
        transcriptBlocksAdded: 4,
        transcriptBlocksReplaced: 3,
        unrelatedTimelineClipsPreserved: 1,
        unrelatedTranscriptBlocksPreserved: 2,
        manualSpeakerCameraMappingsPreserved: 1,
        speakerCameraMappingsAdded: 0,
      },
      boundaries: {
        sourceMediaUnchanged: true,
        providerWordsUnchanged: true,
        reviewedAlignmentRequiredForNonSpineSources: true,
        speakerIdentityNeverGuessed: true,
        existingHumanTimelineDecisionsPreserved: true,
        publicationNotStarted: true,
      },
    },
  })) as typeof fetch;

  render(<CaptureTakeMaterializationPanel
    projectSlug="high-ground-odyssey"
    episodeSlug="episode-9"
    captureGroupId="take-9"
    expectedTimelineFingerprint="current-timeline"
    onMaterialized={jest.fn()}
  />);

  expect(await screen.findByRole("heading", { name: "Update this take with new evidence" })).toBeInTheDocument();
  const impact = screen.getByLabelText("Exact episode update preview");
  expect(within(impact).getByText("0 new · 2 reused")).toBeInTheDocument();
  expect(within(impact).getByText("4 add · 3 replace")).toBeInTheDocument();
  expect(within(impact).getByText("1 clips · 2 turns preserved")).toBeInTheDocument();
  expect(within(impact).getByText("0 add · 1 manual preserved")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update episode with current evidence" })).toBeEnabled();
  expect(screen.getByRole("heading", { name: "Participant camera readiness" })).toBeInTheDocument();
  expect(screen.getByText("NO VIDEO SOURCES")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open this Session’s recording sources" })).toHaveAttribute("href", "/sessions/room-9?mode=recordings");
  expect(screen.getByRole("link", { name: "Review exact-source speaker identity" })).toHaveAttribute(
    "href",
    "/sessions/room-9?mode=transcript&source=audio-backup#speaker-attribution-review",
  );
  expect(screen.getByText(/server rechecks its fingerprint before writing/i)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});
