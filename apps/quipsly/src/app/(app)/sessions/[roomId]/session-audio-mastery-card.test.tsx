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

describe("Session audio mastery", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: fetchMock });
  });

  it("automatically prepares a listening copy and keeps the original beside it", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ ok: true, status: "not-queued" }))
      .mockResolvedValueOnce(response({
        ok: true,
        status: "completed",
        derivative: { playbackUrl: "/api/ingest/media/mastered-source-1" },
        proposal: {
          action: "render-loudness-master",
          profile: { integratedLufs: -16, maximumTruePeakDbtp: -1 },
        },
      }));
    render(<SessionAudioMasteryCard coordinates={coordinates} />);

    expect(await screen.findByText("Improved listening copy")).toBeInTheDocument();
    expect(screen.getByText("Improved copy ready")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByText(/has not replaced or published either version/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/media-vault/audio-mastery", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"sourceId":"source-recording-1"'),
    }));
    await waitFor(() => expect(document.querySelector('audio[src="/api/ingest/media/source-recording-1"]')).toBeInTheDocument());
    expect(document.querySelector('audio[src="/api/ingest/media/mastered-source-1"]')).toBeInTheDocument();
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
