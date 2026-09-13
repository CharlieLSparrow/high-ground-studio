/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionTranscriptionProgress } from "./session-transcription-progress";
import type { TranscriptionProgressSource } from "@/lib/transcription-progress";

const source: TranscriptionProgressSource = {
  recordingAssetId: "asset-casey", participantLabel: "Casey", transcriptJobId: "job-casey",
  status: "FAILED", error: "Temporary provider failure",
};
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

it("retries the existing recording once and refreshes its progress", async () => {
  let resolve!: (value: unknown) => void;
  const fetchMock = jest.fn(() => new Promise(done => { resolve = done; }));
  global.fetch = fetchMock as any;
  const onUpdated = jest.fn();
  render(<SessionTranscriptionProgress sources={[source]} onUpdated={onUpdated} />);
  const button = screen.getByRole("button", {name: "Retry transcription for Casey"});
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/mobile/capture/transcripts/run", expect.objectContaining({
    method: "POST", credentials: "same-origin", body: JSON.stringify({recordingAssetId: "asset-casey"}),
  }));
  expect(button).toBeDisabled();
  await act(async () => resolve({ok: true, json: async () => ({ok: true})}));
  expect(onUpdated).toHaveBeenCalledTimes(1);
  expect(button).toBeEnabled();
});

it.each(["QUEUED", "RUNNING", "PROCESSING", "COMPLETED"])("does not duplicate a %s job", status => {
  render(<SessionTranscriptionProgress sources={[{...source, status, error: null}]} onUpdated={jest.fn()} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(status === "QUEUED" ? "Waiting to transcribe" : status === "COMPLETED" ? "Transcript ready" : "Transcribing");
});

it("offers transcription when the saved source has no job yet", async () => {
  global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true})});
  const onUpdated = jest.fn();
  render(<SessionTranscriptionProgress sources={[{...source, transcriptJobId: null, status: null, error: null}]} onUpdated={onUpdated} />);
  fireEvent.click(screen.getByRole("button", {name: "Start transcription for Casey"}));
  await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
});

it("shows a failed request without losing the recording or disabling another attempt", async () => {
  global.fetch = jest.fn().mockResolvedValue({ok: false, json: async () => ({error: "Transcription service is unavailable."})});
  const onUpdated = jest.fn();
  render(<SessionTranscriptionProgress sources={[source]} onUpdated={onUpdated} />);
  fireEvent.click(screen.getByRole("button", {name: "Retry transcription for Casey"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Transcription service is unavailable.");
  expect(screen.getByRole("button", {name: "Retry transcription for Casey"})).toBeEnabled();
  expect(screen.getByText(/Your recording is saved/)).toBeInTheDocument();
  expect(onUpdated).not.toHaveBeenCalled();
});

it("times out a stalled retry and makes it available again", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })) as typeof fetch;
  render(<SessionTranscriptionProgress sources={[source]} onUpdated={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", {name: "Retry transcription for Casey"}));
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("Starting transcription is taking too long.");
  expect(screen.getByRole("button", {name: "Retry transcription for Casey"})).toBeEnabled();
});

it("does not refresh a different workspace when a late retry response arrives", async () => {
  let resolve!: (value: unknown) => void;
  global.fetch = jest.fn(() => new Promise<unknown>(done => { resolve = done; })) as typeof fetch;
  const onUpdated = jest.fn();
  const {unmount} = render(<SessionTranscriptionProgress sources={[source]} onUpdated={onUpdated} />);
  fireEvent.click(screen.getByRole("button", {name: "Retry transcription for Casey"}));
  unmount();
  await act(async () => resolve({ok: true, json: async () => ({ok: true})}));
  expect(onUpdated).not.toHaveBeenCalled();
});
