import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { SessionRecordingAudio } from "./session-recording-audio";

const src = "/api/sessions/room-1/recording-share/media/output-1";
function setup() {
  const ref = createRef<HTMLAudioElement>();
  const onTimeUpdate = jest.fn();
  const view = render(<SessionRecordingAudio ref={ref} src={src} controls aria-label="Session audio" onTimeUpdate={onTimeUpdate} />);
  const media = ref.current!;
  Object.defineProperty(media, "duration", { configurable: true, value: 60 });
  fireEvent.loadedMetadata(media);
  return { media, ref, view, onTimeUpdate };
}
afterEach(() => jest.restoreAllMocks());

test("uses the same forwarded media element and follows transcript-driven time changes", () => {
  const { media, onTimeUpdate } = setup();
  media.currentTime = 18.5;
  fireEvent.timeUpdate(media);
  expect(onTimeUpdate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("slider", {name: "Recording position"})).toHaveValue("18.5");
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "0:18 of 1:00");
  expect(media).not.toHaveAttribute("controls");
});

test("play and pause reflect media events, not optimistic button state", async () => {
  const { media } = setup();
  const play = jest.spyOn(media, "play").mockResolvedValue();
  const pause = jest.spyOn(media, "pause").mockImplementation(() => {
    Object.defineProperty(media, "paused", {configurable: true, value: true});
    fireEvent.pause(media);
  });
  fireEvent.click(screen.getByRole("button", { name: "Play recording" }));
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause recording" })).toBeNull();
  Object.defineProperty(media, "paused", {configurable: true, value: false});
  fireEvent.play(media);
  fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
  expect(pause).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play recording" })).toBeEnabled());
});

test("seek and skip controls stay within the recording and report readable time", () => {
  const { media } = setup();
  fireEvent.change(screen.getByRole("slider"), {target: {value: "55"}});
  expect(media.currentTime).toBe(55);
  fireEvent.click(screen.getByRole("button", {name: "Forward 10 seconds"}));
  expect(media.currentTime).toBe(60);
  fireEvent.change(screen.getByRole("slider"), {target: {value: "4"}});
  fireEvent.click(screen.getByRole("button", {name: "Back 10 seconds"}));
  expect(media.currentTime).toBe(0);
});

test("speed and mute controls change the real player", () => {
  const { media } = setup();
  fireEvent.change(screen.getByRole("combobox", {name: "Playback speed"}), {target: {value: "1.5"}});
  expect(media.playbackRate).toBe(1.5);
  fireEvent.rateChange(media);
  expect(screen.getByRole("combobox")).toHaveValue("1.5");
  fireEvent.click(screen.getByRole("button", {name: "Mute playback"}));
  expect(media.muted).toBe(true);
  fireEvent.volumeChange(media);
  expect(screen.getByRole("button", {name: "Unmute playback"})).toBeEnabled();
});

test("a playback rejection leaves a usable retry and does not claim to be playing", async () => {
  const { media } = setup();
  jest.spyOn(media, "play").mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  fireEvent.click(screen.getByRole("button", {name: "Play recording"}));
  expect(await screen.findByText(/hasn’t allowed playback/)).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Play recording"})).toBeEnabled();
  expect(screen.getByRole("button", {name: "Retry playback"})).toBeEnabled();
});

test("network retry reloads the same private URL and restores position without autoplay", () => {
  const { media } = setup();
  const load = jest.spyOn(media, "load").mockImplementation(() => {});
  const play = jest.spyOn(media, "play").mockResolvedValue();
  media.currentTime = 23;
  fireEvent.timeUpdate(media);
  Object.defineProperty(media, "error", {configurable: true, value: {code: 2}});
  fireEvent.error(media);
  fireEvent.click(screen.getByRole("button", {name: "Retry playback"}));
  expect(load).toHaveBeenCalledTimes(1);
  expect(media.getAttribute("src")).toBe(src);
  media.currentTime = 0;
  fireEvent.loadedMetadata(media);
  expect(media.currentTime).toBe(23);
  expect(play).not.toHaveBeenCalled();
});

test("source changes clear old errors, play promises, and seek state", async () => {
  const { media, ref, view } = setup();
  let reject!: (reason: unknown) => void;
  jest.spyOn(media, "play").mockImplementation(() => new Promise((_, failure) => {reject = failure;}));
  fireEvent.click(screen.getByRole("button", {name: "Play recording"}));
  view.rerender(<SessionRecordingAudio ref={ref} src="/api/sessions/room-2/recording-share/media/output-2" controls aria-label="Other audio" />);
  await act(async () => {reject(new Error("Old source failed"));});
  expect(screen.queryByText(/Playback couldn’t start/)).toBeNull();
  expect(screen.getByRole("group", {name: "Other audio playback controls"})).toBeInTheDocument();
});

test("unknown duration disables seek controls, not play", () => {
  render(<SessionRecordingAudio src={src} controls aria-label="Loading audio" />);
  expect(screen.getByRole("slider")).toBeDisabled();
  expect(screen.getByRole("button", {name: "Back 10 seconds"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "Play recording"})).toBeEnabled();
});

test("transient network errors never request a new encoding", () => {
  global.fetch = jest.fn();
  const ref = createRef<HTMLAudioElement>();
  render(<SessionRecordingAudio ref={ref} src="/api/sessions/room-1/recordings/source-1/media" controls />);
  Object.defineProperty(ref.current, "error", {configurable: true, value: {code: 2}});
  fireEvent.error(ref.current!);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: "Retry playback"})).toBeEnabled();
});
