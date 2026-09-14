import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecordingEditListen } from "./recording-edit-listen";

const sources = [{id: "coach", label: "Coach", url: "/coach.mp3", offset: 0, duration: 20},
  {id: "client", label: "Client", url: "/client.mp3", offset: 2, duration: 18}];
function ready(container: HTMLElement) {
  for (const audio of container.querySelectorAll("audio[data-listen-source]")) {
    Object.defineProperty(audio, "readyState", {configurable: true, value: 3});
    fireEvent.loadedMetadata(audio);
  }
}
beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function(this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", {configurable: true, value: false});
  });
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function(this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", {configurable: true, value: true});
  });
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("waits for both tracks, plays the current edit, and stops on an actual edit change", async () => {
  const props = {sources, startSeconds: 3, endSeconds: 12, cuts: [{startSeconds: 5, endSeconds: 7}]};
  const {container, rerender} = render(<RecordingEditListen {...props} />);
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeDisabled();
  ready(container);
  fireEvent.click(screen.getByRole("button", {name: "Listen to edit"}));
  await screen.findByRole("button", {name: "Pause edit"});
  expect([...container.querySelectorAll("audio")].map(media => media.currentTime)).toEqual([3, 1]);
  expect(screen.getByRole("slider", {name: "Edited recording position"})).toHaveAttribute("max", "7");
  rerender(<RecordingEditListen {...props} sources={sources.map(source => ({...source}))} />);
  expect(screen.getByRole("button", {name: "Pause edit"})).toBeEnabled();
  rerender(<RecordingEditListen {...props} endSeconds={10} />);
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeEnabled();
  expect([...container.querySelectorAll("audio")].every(media => media.paused)).toBe(true);
  expect(screen.getByRole("slider", {name: "Edited recording position"})).toHaveAttribute("max", "5");
});

test("preview pauses on backgrounding and cannot continue after unmount", async () => {
  const {container, unmount} = render(<RecordingEditListen sources={sources} startSeconds={0} endSeconds={10} cuts={[]} />);
  ready(container);
  fireEvent.click(screen.getByRole("button", {name: "Listen to edit"}));
  await screen.findByRole("button", {name: "Pause edit"});
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeEnabled();
  hidden.mockRestore();
  const tracks = [...container.querySelectorAll("audio")];
  unmount();
  expect(tracks.every(media => media.paused)).toBe(true);
});

test("uses one recording player at a time without pausing the live call", async () => {
  const {container} = render(<><audio aria-label="Live call" /><section id="recording-share">
    <audio aria-label="Original" /><RecordingEditListen sources={sources} startSeconds={0} endSeconds={10} cuts={[]} />
  </section></>);
  const live = screen.getByLabelText("Live call") as HTMLAudioElement;
  const original = screen.getByLabelText("Original") as HTMLAudioElement;
  Object.defineProperty(live, "paused", {configurable: true, value: false});
  Object.defineProperty(original, "paused", {configurable: true, value: false});
  ready(container);
  fireEvent.click(screen.getByRole("button", {name: "Listen to edit"}));
  await screen.findByRole("button", {name: "Pause edit"});
  expect(live.paused).toBe(false);
  expect(original.paused).toBe(true);
  fireEvent.play(original);
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeEnabled();
});

test("disables listening for unknown timing and fully removed audio", () => {
  const {container, rerender} = render(<RecordingEditListen sources={sources} startSeconds={0} endSeconds={5} cuts={[{startSeconds: 0, endSeconds: 5}]} />);
  ready(container);
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeDisabled();
  expect(screen.getByText("Nothing to play. Restore a cut or extend the trim to include some audio.")).toBeInTheDocument();
  rerender(<RecordingEditListen sources={[{...sources[0]!, offset: NaN}]} startSeconds={0} endSeconds={5} cuts={[]} />);
  expect(screen.getByText("Select tracks with available recording timing to listen.")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Listen to edit"})).toBeDisabled();
});
