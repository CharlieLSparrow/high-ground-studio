import { render, screen, within } from "@testing-library/react";

import { SessionRecordingHealthCard } from "./session-recording-health-card";
import { EMPTY_SESSION_READINESS_TOPOLOGY } from "./session-readiness-topology";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

const noEvidence: SessionSourceEvidence = { sources: [], counts: { VERIFIED_MATCH: 0, HELD: 0, DRIFT: 0, INCOMPLETE: 0 } };

function missingRequiredMaster(): SessionReadinessTopology {
  return {
    ...EMPTY_SESSION_READINESS_TOPOLOGY,
    expectedSources: [{
      id: "expected-homer-audio",
      participantId: "homer",
      participantLabel: "Homer",
      label: "Homer iPhone microphone master",
      sourceKind: "audio",
      retentionRole: "required-master",
      status: "active",
      expectedClientKind: "ios",
      expectedDeviceLabel: "Homer iPhone",
      recordingAssetId: null,
      captureId: null,
      revision: 1,
      latestReason: null,
      fulfillment: "missing",
      blocking: true,
      candidateSources: [],
      createdAt: "2026-08-06T01:00:00.000Z",
      updatedAt: "2026-08-06T01:00:00.000Z",
    }],
  };
}

describe("Session recording health card", () => {
  it("renders the missing planned source and every independent evidence gate", () => {
    render(<SessionRecordingHealthCard roomId="episode-9" topology={missingRequiredMaster()} sourceEvidence={noEvidence} />);

    const flightDeck = screen.getByRole("region", { name: "At least one source is unsafe to use" });
    expect(flightDeck).toHaveAttribute("data-session-recording-health", "BLOCKED");
    expect(within(flightDeck).getByRole("heading", { name: "Recording health for Homer iPhone microphone master" })).toBeInTheDocument();
    expect(within(flightDeck).getByText("No mystery score:", { exact: false })).toBeInTheDocument();
    expect(within(flightDeck).getByText("Source plan")).toBeInTheDocument();
    expect(within(flightDeck).getByText("Exact bytes")).toBeInTheDocument();
    expect(within(flightDeck).getByText("Decoded media")).toBeInTheDocument();
    expect(within(flightDeck).getByText("Useful signal")).toBeInTheDocument();
    expect(within(flightDeck).getByText("Processing release")).toBeInTheDocument();
    expect(within(flightDeck).getByText("Transcript release")).toBeInTheDocument();
    expect(within(flightDeck).getByRole("link", { name: /Open source plan/i })).toHaveAttribute("href", "/sessions/episode-9?mode=recordings#session-recording-plan-heading");
  });

  it("shows unknown rather than green when there is nothing to evaluate", () => {
    render(<SessionRecordingHealthCard roomId="empty" topology={EMPTY_SESSION_READINESS_TOPOLOGY} sourceEvidence={noEvidence} />);

    const flightDeck = screen.getByRole("region", { name: "Recording health is not yet known" });
    expect(flightDeck).toHaveAttribute("data-session-recording-health", "UNKNOWN");
    expect(within(flightDeck).getByText(/No active planned or retained source/)).toBeInTheDocument();
  });
});
