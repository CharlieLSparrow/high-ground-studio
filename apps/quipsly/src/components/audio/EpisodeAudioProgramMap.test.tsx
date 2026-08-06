import { fireEvent, render, screen } from "@testing-library/react";

import type { EpisodeAudioProgram } from "@/lib/episode-audio-program";

import { EpisodeAudioProgramMap } from "./EpisodeAudioProgramMap";

const roleDecision = {
  id: "decision-role-1",
  operation: "set" as const,
  kind: "track-role" as const,
  assetId: "asset-a",
  sourceId: "source-a",
  value: "dialogue-primary",
  label: "Primary dialogue",
  targetReceiptId: null,
  stale: false,
  actorEmail: "editor@example.test",
  occurredAt: "2026-08-06T20:00:00.000Z",
};

const program = {
  fingerprintSha256: "f".repeat(64),
  participantCatalog: [{ id: "participant-1", label: "Homer Sparrow", email: "homer@example.test", role: "host", deviceLabel: "iPhone" }],
  activeDecisions: [roleDecision],
  tracks: [{
    assetId: "asset-a",
    sourceId: "source-a",
    title: "Homer iPhone camera.mov",
    kind: "dialogue",
    role: "dialogue-primary",
    importedRole: "participant-camera",
    participantId: null,
    participantLabel: null,
    mixDisposition: "include",
    groupKey: "source:source-a",
    contentType: "video/quicktime",
    durationSeconds: 90,
    syncStatus: null,
    attentionScore: 100,
    attentionReason: "Preserve: retained source available",
    stages: [
      { id: "preserve", label: "Preserve", state: "ready", detail: "Retained source is available" },
      { id: "align", label: "Align", state: "not-started", detail: "No reviewed shared-clock evidence yet" },
      { id: "understand", label: "Understand", state: "not-started", detail: "Not complete" },
      { id: "treat", label: "Treat", state: "not-started", detail: "Not reviewed" },
      { id: "finish", label: "Finish", state: "not-started", detail: "Not approved" },
    ],
    processing: {},
    decisions: [roleDecision],
  }],
  groups: [{ key: "source:source-a", label: "Homer iPhone camera.mov", trackCount: 1, multiDevice: false }],
  summary: { retainedTrackCount: 1, dialogueTrackCount: 1, heldTrackCount: 0, alignedTrackCount: 0, understoodTrackCount: 0, finishedTrackCount: 0, multiDeviceGroupCount: 0, activeDecisionCount: 1, staleDecisionCount: 0, hasProgramClock: false },
  nextAttention: null,
  boundaries: { readOnlyProjection: true, sourcesRemainImmutable: true, processingIsEvidenceNotTaste: true, noMixRendered: true, noTimelinePlacementApplied: true },
} as unknown as EpisodeAudioProgram;

describe("EpisodeAudioProgramMap", () => {
  it("collects an explicit withdrawal reason without a browser-native prompt", () => {
    const onWithdrawDecision = jest.fn();
    render(<EpisodeAudioProgramMap program={program} selectedAssetId="asset-a" onSelectTrack={jest.fn()} onSetDecision={jest.fn()} onWithdrawDecision={onWithdrawDecision} />);

    fireEvent.click(screen.getByRole("button", { name: "Primary dialogue · withdraw" }));
    expect(screen.getByRole("group", { name: "Withdraw audio decision" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Audio decision withdrawal reason" }), { target: { value: "The reviewed speaker role was incorrect." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

    expect(onWithdrawDecision).toHaveBeenCalledWith(roleDecision, "The reviewed speaker role was incorrect.");
    expect(screen.queryByRole("group", { name: "Withdraw audio decision" })).not.toBeInTheDocument();
  });
});
