import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { EpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";

import { EpisodeAudioMatchedAudition } from "./EpisodeAudioMatchedAudition";

const plan: EpisodeAudioComparisonPlan = {
  schema: "quipsly-episode-audio-comparison-plan-v1",
  momentId: "overlap-1",
  momentKind: "possible-participant-overlap",
  label: "Possible participant overlap",
  detail: "Listen before classifying this region.",
  programStartSeconds: 28.5,
  programEndSeconds: 34.5,
  durationSeconds: 6,
  sources: [
    { assetId: "charlie", sourceId: "source-charlie", title: "Charlie MV7i.wav", participantLabel: "Charlie", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, sourceStartSeconds: 28.5, sourceEndSeconds: 34.5, playbackUrl: "/charlie" },
    { assetId: "homer", sourceId: "source-homer", title: "Homer iPhone.mov", participantLabel: "Homer", role: "dialogue-primary", alignment: "qualified-candidate", programOffsetSeconds: 0.35, sourceStartSeconds: 28.15, sourceEndSeconds: 34.15, playbackUrl: "/homer" },
  ],
  omitted: [],
  boundaries: { protectedSourcePlaybackOnly: true, monitorGainDoesNotChangeMedia: true, playbackDoesNotConfirmClassification: true, candidateAlignmentDoesNotMoveTimeline: true },
};

describe("EpisodeAudioMatchedAudition", () => {
  const play = jest.fn(async () => undefined);
  const pause = jest.fn();

  beforeEach(() => {
    play.mockClear();
    pause.mockClear();
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  });

  it("starts every protected source from its exact source-clock range on one gesture", async () => {
    const onPausePrimarySource = jest.fn();
    render(<EpisodeAudioMatchedAudition plan={plan} onClose={jest.fn()} onPausePrimarySource={onPausePrimarySource} />);

    expect(screen.getByRole("heading", { name: "Possible participant overlap" })).toBeInTheDocument();
    expect(screen.getByText(/never alter retained bytes, alignment, the timeline, or a classification/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading sources 0/2" })).toBeDisabled();
    document.querySelectorAll("audio").forEach((media) => fireEvent.loadedMetadata(media));
    fireEvent.click(screen.getByRole("button", { name: "Play together" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(onPausePrimarySource).toHaveBeenCalledTimes(1);
    const media = document.querySelectorAll("audio");
    expect(media[0].currentTime).toBeCloseTo(28.5, 3);
    expect(media[1].currentTime).toBeCloseTo(28.15, 3);
  });

  it("supports explicit solo monitoring without calling it a classification", () => {
    render(<EpisodeAudioMatchedAudition plan={plan} onClose={jest.fn()} />);
    const homer = screen.getByRole("button", { name: /Homer Solo monitor/i });
    fireEvent.click(homer);
    expect(homer).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/A later review receipt must still name what was actually heard/i)).toBeInTheDocument();
  });

  it("fails closed when every retained source cannot start", async () => {
    play.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("media unavailable"));
    render(<EpisodeAudioMatchedAudition plan={plan} onClose={jest.fn()} />);
    document.querySelectorAll("audio").forEach((media) => fireEvent.loadedMetadata(media));
    fireEvent.click(screen.getByRole("button", { name: "Play together" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not all start together");
    expect(pause).toHaveBeenCalled();
  });

  it("binds a partial needs-comparison receipt to observed playback bins", async () => {
    const onSubmitReview = jest.fn();
    render(<EpisodeAudioMatchedAudition plan={plan} analysisId="analysis-1" onClose={jest.fn()} onSubmitReview={onSubmitReview} />);
    const media = document.querySelectorAll("audio");
    media.forEach((element) => fireEvent.loadedMetadata(element));
    fireEvent.click(screen.getByRole("button", { name: "Play together" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Pause together" });
    media[0].currentTime = 28.75;
    fireEvent.timeUpdate(media[0]);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "needs-comparison" } });
    fireEvent.change(screen.getByLabelText(/Listening note/), { target: { value: "Need a cleaner solo pass." } });
    const submit = await screen.findByRole("button", { name: "Record listening conclusion" });
    fireEvent.click(submit);
    expect(onSubmitReview).toHaveBeenCalledWith(expect.objectContaining({
      decision: "needs-comparison",
      playbackEvidence: expect.objectContaining({ analysisId: "analysis-1", eventId: "overlap-1", coverage: expect.objectContaining({ allMonitorBins: [1] }) }),
    }));
  });
});
