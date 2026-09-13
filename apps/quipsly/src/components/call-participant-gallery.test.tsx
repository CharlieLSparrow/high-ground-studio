import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Track, type RemoteTrack } from "livekit-client";
import { CallParticipantGallery, type CallParticipant, type CallParticipantVideo } from "./call-participant-gallery";

const people: CallParticipant[] = [
  {identity: "me", name: "Casey", isLocal: true, microphoneMuted: false, speaking: false},
  {identity: "client", name: "Riley", isLocal: false, microphoneMuted: true, speaking: false},
];
const base = {participants: people, videos: [] as CallParticipantVideo[], bindLocalVideo: jest.fn(), localCameraOn: true, localMicrophoneMuted: false};

it("counts people independently of camera endpoints and preserves both cameras", () => {
  const roster = [people[0], {...people[1], personKey: "riley", deviceLabel: "iPhone"}, {...people[1], identity: "client-browser", personKey: "riley", deviceLabel: "Browser"}];
  const camera = video(), second = {...video(), identity: "client-browser", key: "second"};
  const view = render(<CallParticipantGallery {...base} participants={roster} videos={[camera, second]} />);
  expect(screen.getByText("2 people in call · 3 devices")).toBeVisible();
  expect(screen.getByRole("article", {name: "Riley · iPhone"})).toBeVisible();
  expect(screen.getByRole("article", {name: "Riley · Browser"})).toBeVisible();
  expect(camera.track.attach).toHaveBeenCalledTimes(1);
  expect(second.track.attach).toHaveBeenCalledTimes(1);
  view.rerender(<CallParticipantGallery {...base} participants={roster.slice(0, 2)} videos={[camera]} />);
  expect(screen.getByText("2 people in call")).toBeVisible();
  expect(second.track.detach).toHaveBeenCalledTimes(1);
  expect(camera.track.detach).not.toHaveBeenCalled();
});
function video(source: Track.Source = Track.Source.Camera) {
  return {identity: "client", key: source, track: {source, attach: jest.fn(), detach: jest.fn()} as unknown as RemoteTrack};
}

it("shows a camera-off person next to a local camera with their name and microphone state", () => {
  render(<CallParticipantGallery {...base} />);
  expect(within(screen.getByRole("article", {name: "Riley"})).getByText("Camera off")).toBeVisible();
  expect(within(screen.getByRole("article", {name: "Riley"})).getByLabelText("Microphone muted")).toBeInTheDocument();
  expect(screen.getByLabelText("Your camera")).not.toHaveClass("invisible");
  expect(screen.getByText("2 people in call")).toBeVisible();
});

it("pins locally without reattaching video, and keeps speaking updates from reordering tiles", () => {
  const source = video();
  const {rerender} = render(<CallParticipantGallery {...base} videos={[source]} />);
  const element = screen.getByLabelText("Riley camera");
  const before = screen.getAllByRole("article").map(tile => tile.getAttribute("aria-label"));
  fireEvent.click(screen.getByRole("button", {name: "Pin Riley for me"}));
  expect(screen.getByRole("article", {name: "Riley"})).toHaveAttribute("data-focused", "true");
  rerender(<CallParticipantGallery {...base} participants={people.map(person => ({...person, speaking: true}))} videos={[source]} />);
  expect(screen.getAllByRole("article").map(tile => tile.getAttribute("aria-label"))).toEqual(before);
  expect(screen.getByLabelText("Riley camera")).toBe(element);
  expect(source.track.attach).toHaveBeenCalledTimes(1);
  expect(source.track.detach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Back to gallery"}));
  expect(screen.getByRole("article", {name: "Riley"})).toHaveAttribute("data-focused", "false");
});

it("keeps screen content separate from the person's camera and does not crop it", () => {
  const camera = video(); const share = video(Track.Source.ScreenShare);
  const {unmount} = render(<CallParticipantGallery {...base} videos={[camera, share]} />);
  expect(screen.getByLabelText("Riley screen")).toHaveClass("object-contain");
  expect(screen.getByLabelText("Riley camera")).toHaveClass("object-cover");
  expect(screen.getByText("2 people in call")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  const element = screen.getByLabelText("Riley screen");
  expect(element).toHaveProperty("muted", true);
  unmount();
  expect(share.track.detach).toHaveBeenCalledWith(element);
});

it("clears a departed person's pin, and does not expose stale tracks after departure", () => {
  const source = video();
  const {rerender} = render(<CallParticipantGallery {...base} videos={[source]} />);
  fireEvent.click(screen.getByRole("button", {name: "Pin Riley for me"}));
  rerender(<CallParticipantGallery {...base} participants={[people[0]]} videos={[source]} />);
  expect(screen.queryByLabelText("Riley camera")).not.toBeInTheDocument();
  expect(screen.getByText(/You’re the first here/)).toBeVisible();
  expect(screen.queryByRole("button", {name: "Back to gallery"})).not.toBeInTheDocument();
  rerender(<CallParticipantGallery {...base} videos={[source]} />);
  expect(screen.getByRole("button", {name: "Pin Riley for me"})).toHaveAttribute("aria-pressed", "false");
});

it("focuses shared content automatically while letting this viewer choose the gallery", () => {
  const share = video(Track.Source.ScreenShare);
  const {rerender} = render(<CallParticipantGallery {...base} videos={[share]} />);
  expect(screen.getByRole("article", {name: "Riley · screen"})).toHaveAttribute("data-focused", "true");
  expect(screen.getByRole("article", {name: "Casey (you)"})).toHaveStyle({gridColumn: "2"});
  fireEvent.click(screen.getByRole("button", {name: "Back to gallery"}));
  rerender(<CallParticipantGallery {...base} videos={[share]} />);
  expect(screen.getByRole("article", {name: "Riley · screen"})).toHaveAttribute("data-focused", "false");
  expect(share.track.attach).toHaveBeenCalledTimes(1);
});

it("never focuses a stale share belonging to someone who has left", () => {
  render(<CallParticipantGallery {...base} participants={[people[0]]} videos={[video(Track.Source.ScreenShare)]} />);
  expect(screen.queryByRole("button", {name: "Back to gallery"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Riley screen")).not.toBeInTheDocument();
});

it("renders the local presentation independently from the local camera", () => {
  const share = {...video(Track.Source.ScreenShare), identity: "me"};
  render(<CallParticipantGallery {...base} localCameraOn={false} videos={[share]} />);
  expect(screen.getByLabelText("Your camera")).toHaveClass("invisible");
  expect(screen.getByLabelText("Casey screen")).toHaveClass("object-contain");
  expect(share.track.attach).toHaveBeenCalledWith(screen.getByLabelText("Casey screen"));
});

it("hides only the local camera tile without unbinding its video or hiding a shared screen", () => {
  const bindLocalVideo = jest.fn();
  const share = {...video(Track.Source.ScreenShare), identity: "me"};
  render(<CallParticipantGallery {...base} bindLocalVideo={bindLocalVideo} videos={[share]} />);
  const localVideo = screen.getByLabelText("Your camera");
  fireEvent.click(screen.getByRole("button", {name: "Hide self"}));
  expect(screen.queryByRole("article", {name: "Casey (you)"})).not.toBeInTheDocument();
  expect(localVideo).toBeInTheDocument();
  expect(localVideo).not.toBeVisible();
  expect(screen.getByLabelText("Casey screen")).toBeVisible();
  expect(bindLocalVideo).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Your camera setting has not changed");
  fireEvent.click(screen.getByRole("button", {name: "Show self"}));
  expect(screen.getByLabelText("Your camera")).toBe(localVideo);
  expect(localVideo).toBeVisible();
  expect(bindLocalVideo).toHaveBeenCalledTimes(1);
});

it("offers a calm empty state when alone with self-view hidden", () => {
  render(<CallParticipantGallery {...base} participants={[people[0]]} />);
  fireEvent.click(screen.getByRole("button", {name: "Hide self"}));
  expect(screen.getByText(/Others will appear here when they join/)).toBeVisible();
  expect(screen.getByRole("button", {name: "Show self"})).toBeEnabled();
});

it("follows a sustained remote speaker, keeps overlap stable, and respects an explicit pin", () => {
  jest.useFakeTimers();
  const third = {...people[1], identity: "third", name: "Morgan"};
  const current = [...people, third];
  const {rerender, unmount} = render(<CallParticipantGallery {...base} participants={current} />);
  fireEvent.change(screen.getByLabelText("Call view"), {target: {value: "speaker"}});
  act(() => { jest.advanceTimersByTime(1_200); });
  rerender(<CallParticipantGallery {...base} participants={current.map(person => ({...person, speaking: person.identity === "third"}))} />);
  act(() => { jest.advanceTimersByTime(600); });
  expect(screen.getByRole("article", {name: "Riley"})).toHaveAttribute("data-focused", "true");
  act(() => { jest.advanceTimersByTime(600); });
  expect(screen.getByRole("article", {name: "Morgan"})).toHaveAttribute("data-focused", "true");
  rerender(<CallParticipantGallery {...base} participants={current.map(person => ({...person, speaking: true}))} />);
  act(() => { jest.advanceTimersByTime(2_000); });
  expect(screen.getByRole("article", {name: "Morgan"})).toHaveAttribute("data-focused", "true");
  fireEvent.click(screen.getByRole("button", {name: "Pin Riley for me"}));
  expect(screen.getByRole("article", {name: "Riley"})).toHaveAttribute("data-focused", "true");
  unmount(); jest.useRealTimers();
});

it("pages a larger gallery without recreating media tracks", () => {
  const source = video();
  const many = [...people, ...Array.from({length: 10}, (_, index) => ({...people[1], identity: `guest-${index}`, name: `Guest ${index}`}))];
  render(<CallParticipantGallery {...base} participants={many} videos={[source]} />);
  const camera = screen.getByLabelText("Riley camera");
  expect(screen.getAllByRole("article")).toHaveLength(9);
  fireEvent.click(screen.getByRole("button", {name: "Next participants"}));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(camera).toBeInTheDocument();
  expect(camera).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Previous participants"}));
  expect(screen.getByLabelText("Riley camera")).toBe(camera);
  expect(source.track.attach).toHaveBeenCalledTimes(1);
  expect(source.track.detach).not.toHaveBeenCalled();
});

it("reflows for the actual stage size without rebinding a camera", () => {
  const original = global.ResizeObserver;
  let resize!: ResizeObserverCallback;
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  } as unknown as typeof ResizeObserver;
  const source = video();
  const {unmount} = render(<CallParticipantGallery {...base} videos={[source]} />);
  const camera = screen.getByLabelText("Riley camera");
  const measure = (width: number, height: number) => act(() => resize([{contentRect: {width, height}}] as ResizeObserverEntry[], {} as ResizeObserver));
  measure(390, 500);
  expect(screen.getByTestId("call-gallery-grid")).toHaveStyle({gridTemplateColumns: "repeat(1, minmax(0, 1fr))"});
  measure(850, 160);
  expect(screen.getByTestId("call-gallery-grid")).toHaveStyle({gridTemplateColumns: "repeat(2, minmax(0, 1fr))"});
  expect(screen.getByLabelText("Riley camera")).toBe(camera);
  expect(source.track.attach).toHaveBeenCalledTimes(1);
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
  global.ResizeObserver = original;
});
