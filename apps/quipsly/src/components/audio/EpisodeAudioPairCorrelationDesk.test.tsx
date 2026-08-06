import { render, screen, waitFor } from "@testing-library/react";

import type { EpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";

import { EpisodeAudioPairCorrelationDesk } from "./EpisodeAudioPairCorrelationDesk";

const plan: EpisodeAudioComparisonPlan = {
  schema: "quipsly-episode-audio-comparison-plan-v1",
  momentId: "possible-participant-overlap-10-20",
  momentKind: "possible-participant-overlap",
  label: "Possible participant overlap",
  detail: "Listen before classifying.",
  programStartSeconds: 10,
  programEndSeconds: 12,
  durationSeconds: 2,
  sources: [
    { assetId: "asset-clock", sourceId: "source-clock", title: "Charlie mic", participantLabel: "Charlie", role: "primary-dialogue", alignment: "program-clock", programOffsetSeconds: 0, sourceStartSeconds: 10, sourceEndSeconds: 12, playbackUrl: "/clock" },
    { assetId: "asset-observed", sourceId: "source-observed", title: "Homer camera", participantLabel: "Homer", role: "camera-scratch", alignment: "qualified-candidate", programOffsetSeconds: 0.2, sourceStartSeconds: 9.8, sourceEndSeconds: 11.8, playbackUrl: "/observed" },
  ],
  omitted: [],
  boundaries: { protectedSourcePlaybackOnly: true, monitorGainDoesNotChangeMedia: true, playbackDoesNotConfirmClassification: true, candidateAlignmentDoesNotMoveTimeline: true },
};

describe("EpisodeAudioPairCorrelationDesk", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, jobId: "pair-1", status: "completed", measurement: { peakPowerCorrelation: 0.812, peakAbsolutePowerCorrelation: 0.812, bestLagMilliseconds: 120, peakProminence: 0.31, waveformCorrelationAtBestLag: 0.544, observationToReferenceLevelDb: -11.8, reliability: 0.93, activeFrameCount: 124, comparedFrameCount: 200 }, error: null }) }) as jest.Mock;
  });

  it("defaults to the program clock and explains correlation without classifying the cause", async () => {
    render(<EpisodeAudioPairCorrelationDesk plan={plan} projectId="project-1" projectSlug="project-one" episodeProductionId="episode-one" analysisReceiptId="analysis-one" canWrite />);

    expect(screen.getByRole("heading", { name: "Measure one exact retained pair" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reference source")).toHaveValue("asset-clock");
    expect(screen.getByText(/cannot decide whether that relationship is bleed, echo, duplicate capture, or intentional overlap/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("+120 ms")).toBeInTheDocument());
    expect(screen.getByText("0.544")).toBeInTheDocument();
    expect(screen.getByText("Cause remains human")).toBeInTheDocument();
  });
});
