import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionRecordingAudio } from "./session-recording-audio";

const src = "/api/sessions/room-1/recordings/recording-1/media";
const endpoint = src.replace(/\/media$/, "/audition");
const response = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);

afterEach(() => jest.restoreAllMocks());

test("CAF playback automatically prepares a private listening copy", async () => {
  global.fetch = jest.fn(() => response({ ok: true, state: "READY", derivative: { url: `${endpoint}/media` } }));
  render(<SessionRecordingAudio aria-label="Recording" src={src} contentType="audio/x-caf" controls />);
  await waitFor(() => expect(screen.getByLabelText("Recording").getAttribute("src")).toBe(`${endpoint}/media`));
  expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST", credentials: "same-origin" }));
});

test("ordinary audio stays direct, with automatic fallback for unsupported source formats", async () => {
  global.fetch = jest.fn(() => response({ ok: true, state: "READY", derivative: { url: `${endpoint}/media` } }));
  render(<SessionRecordingAudio aria-label="Recording" src={src} controls />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.error(screen.getByLabelText("Recording"));
  await waitFor(() => expect(screen.getByLabelText("Recording").getAttribute("src")).toBe(`${endpoint}/media`));
});

test("changing sources cancels stale preparation and refuses a different recording", async () => {
  let resolve!: (value: Response) => void;
  global.fetch = jest.fn(() => new Promise<Response>((done) => { resolve = done; }));
  const view = render(<SessionRecordingAudio aria-label="Recording" src={src} contentType="audio/caf" />);
  const options = (fetch as jest.Mock).mock.calls[0][1];
  view.rerender(<SessionRecordingAudio aria-label="Recording" src="/audio/other.m4a" />);
  expect(options.signal.aborted).toBe(true);
  resolve(await response({ ok: true, state: "READY", derivative: { url: `${endpoint}/media` } }));
  await waitFor(() => expect(screen.getByLabelText("Recording").getAttribute("src")).toBe("/audio/other.m4a"));
});

test("unexpected derivative identity offers retry instead of playing another recording", async () => {
  global.fetch = jest.fn(() => response({ ok: true, state: "READY", derivative: { url: "/other/media" } }));
  render(<SessionRecordingAudio aria-label="Recording" src={src} contentType="audio/caf" />);
  expect(await screen.findByRole("button", { name: "Retry playback" })).toBeTruthy();
  expect(screen.getByLabelText("Recording").getAttribute("src")).toBeNull();
});
