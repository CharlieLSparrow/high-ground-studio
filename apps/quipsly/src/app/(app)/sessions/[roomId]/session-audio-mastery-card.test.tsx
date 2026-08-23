import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionAudioMasteryCard } from "./session-audio-mastery-card";

function response(payload: Record<string, unknown>, ok = true) {
  return { ok, status: ok ? 200 : 409, json: async () => payload } as Response;
}

const coordinates = {
  projectId: "project-coaching-1",
  projectSlug: "coach-home",
  assetId: "asset-recording-1",
  sourceId: "source-recording-1",
  sourceUrl: "/api/ingest/media/source-recording-1",
  sourceKind: "audio" as const,
};

function measurement(integratedLufs: number, truePeakDbtp: number) {
  return {
    measuredAt: "2026-08-22T12:00:00.000Z",
    durationSeconds: 12,
    integratedLufs,
    truePeakDbtp,
    loudnessRangeLu: 4,
    thresholdLufs: -32,
    seriesResolutionMs: 1_000,
    series: [
      { timeMs: 1_000, momentaryLufs: integratedLufs - 2, shortTermLufs: integratedLufs - 1, integratedLufs, truePeakDbtp },
      { timeMs: 6_000, momentaryLufs: integratedLufs, shortTermLufs: integratedLufs, integratedLufs, truePeakDbtp },
      { timeMs: 10_000, momentaryLufs: integratedLufs + 2, shortTermLufs: integratedLufs + 1, integratedLufs, truePeakDbtp },
    ],
  };
}

describe("Session audio mastery", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: fetchMock });
  });

  it("automatically prepares a level-matched comparison without replacing the original", async () => {
    const sourceMeasurement = measurement(-24, -3);
    const improvedMeasurement = measurement(-16, -1.5);
    fetchMock
      .mockResolvedValueOnce(response({ ok: true, status: "not-queued" }))
      .mockResolvedValueOnce(response({
        ok: true,
        jobId: "mastery-job-1",
        status: "completed",
        sourceMeasurement,
        signalDiagnosis: null,
        derivative: {
          playbackUrl: "/api/ingest/media/mastered-source-1",
          sha256: "b".repeat(64),
          sizeBytes: 1_152_044,
          measured: improvedMeasurement,
          verification: { integratedStatus: "passes", truePeakStatus: "passes", integratedDeltaLu: 0, passes: true },
        },
        proposal: {
          action: "render-loudness-master",
          profile: { id: "apple-podcasts-dialogue-v1", label: "Podcast dialogue", integratedLufs: -16, maximumTruePeakDbtp: -1, renderTruePeakDbtp: -1.5 },
          assessment: { integratedStatus: "below-target", truePeakStatus: "passes", integratedDeltaLu: -8, passes: false },
        },
        review: { latest: null, approvalCount: 0, rejectionCount: 0 },
      }));
    const user = userEvent.setup();
    render(<SessionAudioMasteryCard coordinates={coordinates} />);

    expect(await screen.findByRole("button", { name: "Compare original and improved" })).toBeInTheDocument();
    expect(screen.getByText("Improved copy ready")).toBeInTheDocument();
    expect(screen.getByText(/original stays untouched/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/media-vault/audio-mastery", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"sourceId":"source-recording-1"'),
    }));

    await user.click(screen.getByRole("button", { name: "Compare original and improved" }));

    expect(screen.getByRole("dialog", { name: "Original and improved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Improved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fair comparison" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Final volume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve improved copy/ })).toBeDisabled();
    await waitFor(() => expect(document.querySelector('audio[src="/api/ingest/media/source-recording-1"]')).toBeInTheDocument());
    expect(document.querySelector('audio[src="/api/ingest/media/mastered-source-1"]')).toHaveAttribute("data-monitor-adjustment-db", "-8");
  });

  it("keeps a failed processor detail optional and offers a familiar retry", async () => {
    fetchMock.mockResolvedValue(response({
      ok: true,
      status: "blocked",
      error: "The processing worker is not configured.",
    }));

    render(<SessionAudioMasteryCard coordinates={coordinates} />);

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Why it did not finish")).toBeInTheDocument();
    expect(screen.queryByText("The processing worker is not configured.")).not.toBeVisible();
  });

  it("does not loop after an automatic audio check fails and lets the user retry", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ ok: true, status: "not-queued" }))
      .mockResolvedValueOnce(response({ ok: false, error: "temporary processor error" }, false))
      .mockResolvedValueOnce(response({
        ok: true,
        status: "completed",
        derivative: { playbackUrl: null },
        proposal: {
          action: "no-change",
          profile: { integratedLufs: -16, maximumTruePeakDbtp: -1 },
        },
      }));
    const user = userEvent.setup();

    render(<SessionAudioMasteryCard coordinates={coordinates} />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your original is safe; try again below");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Audio is balanced")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
