import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {RecordingTranscriptPreview} from "./recording-transcript-preview";

jest.mock("./transcript-export-dialog", () => ({TranscriptExportDialog: () => <button>Export matching transcript</button>}));
const sha = "a".repeat(64);
const segments = [{text: "A useful next step.", speakerLabel: "Riley", startSeconds: 2.5, endSeconds: 4},
  {text: "We will talk next week.", speakerLabel: "Casey", startSeconds: 6, endSeconds: 8}];
const response = (overrides = {}) => ({ok: true, json: async () => ({ok: true, outputSha256: sha, segments, ...overrides})});
const open = () => fireEvent.click(screen.getByRole("button", {name: "Read along with this recording"}));
beforeEach(() => {global.fetch = jest.fn().mockResolvedValue(response());});

it("loads on demand, seeks the edited clock, and marks simultaneous playback without moving focus", async () => {
  const media = document.createElement("audio");
  media.play = jest.fn().mockResolvedValue(undefined);
  render(<RecordingTranscriptPreview title="Edit" sourceUrl="/output/one" outputSha256={sha} mediaRef={{current: media}} />);
  expect(fetch).not.toHaveBeenCalled();
  open();
  const passage = await screen.findByRole("button", {name: /A useful next step/});
  fireEvent.click(passage);
  await waitFor(() => expect(media.play).toHaveBeenCalledTimes(1));
  expect(media.currentTime).toBe(2.5);
  fireEvent.timeUpdate(media);
  expect(passage).toHaveAttribute("aria-current", "true");
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Casey"}});
  expect(screen.queryByRole("button", {name: /A useful next step/})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: /We will talk next week/})).toBeVisible();
});

it("does not play captions from a different rendered file", async () => {
  jest.mocked(fetch).mockResolvedValue(response({outputSha256: "b".repeat(64)}) as Response);
  render(<RecordingTranscriptPreview title="Edit" sourceUrl="/output/one" outputSha256={sha} mediaRef={{current: null}} />);
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  expect(screen.queryByRole("button", {name: /A useful next step/})).not.toBeInTheDocument();
  jest.mocked(fetch).mockResolvedValue(response() as Response);
  fireEvent.click(screen.getByRole("button", {name: "Refresh transcript"}));
  expect(await screen.findByRole("button", {name: /A useful next step/})).toBeVisible();
});

it("discards an old output response and rechecks authorization on reopening", async () => {
  let resolve!: (value: Response) => void;
  jest.mocked(fetch).mockImplementationOnce(() => new Promise(done => {resolve = done;}));
  const view = render(<RecordingTranscriptPreview title="Edit" sourceUrl="/output/one" outputSha256={sha} mediaRef={{current: null}} />);
  open();
  view.rerender(<RecordingTranscriptPreview title="Edit" sourceUrl="/output/two" outputSha256={sha} mediaRef={{current: null}} />);
  expect(await screen.findByRole("button", {name: /A useful next step/})).toBeVisible();
  await act(async () => resolve(response({segments: [{...segments[0], text: "Old private text"}]}) as Response));
  expect(screen.queryByText("Old private text")).not.toBeInTheDocument();
  open();
  jest.mocked(fetch).mockResolvedValue({ok: false, json: async () => ({ok: false, error: "This recording is no longer shared."})} as Response);
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer shared");
  expect(screen.queryByRole("button", {name: /A useful next step/})).not.toBeInTheDocument();
});

it("keeps a missing transcript an informative state, not a playback failure", async () => {
  jest.mocked(fetch).mockResolvedValue(response({segments: [], notice: "Some recording tracks do not have a transcript yet."}) as Response);
  render(<RecordingTranscriptPreview title="Edit" sourceUrl="/output/one" outputSha256={sha} mediaRef={{current: null}} />);
  open();
  expect(await screen.findByText(/You can still listen to or share/)).toBeVisible();
  expect(screen.getByRole("button", {name: "Refresh transcript"})).toBeEnabled();
});
