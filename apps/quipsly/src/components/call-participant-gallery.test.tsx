import { fireEvent, render, screen, within } from "@testing-library/react";
import { Track, type RemoteTrack } from "livekit-client";
import { CallParticipantGallery, type CallParticipant, type CallParticipantVideo } from "./call-participant-gallery";

const people: CallParticipant[] = [
  {identity: "me", name: "Casey", isLocal: true, microphoneMuted: false, speaking: false},
  {identity: "client", name: "Riley", isLocal: false, microphoneMuted: true, speaking: false},
];
const base = {participants: people, videos: [] as CallParticipantVideo[], bindLocalVideo: jest.fn(), localCameraOn: true, localMicrophoneMuted: false};
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
  expect(screen.getByRole("article", {name: "Riley"})).toHaveClass("col-span-full");
  rerender(<CallParticipantGallery {...base} participants={people.map(person => ({...person, speaking: true}))} videos={[source]} />);
  expect(screen.getAllByRole("article").map(tile => tile.getAttribute("aria-label"))).toEqual(before);
  expect(screen.getByLabelText("Riley camera")).toBe(element);
  expect(source.track.attach).toHaveBeenCalledTimes(1);
  expect(source.track.detach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Show everyone equally"}));
  expect(screen.getByRole("article", {name: "Riley"})).not.toHaveClass("col-span-full");
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
  expect(screen.queryByRole("button", {name: "Show everyone equally"})).not.toBeInTheDocument();
  rerender(<CallParticipantGallery {...base} videos={[source]} />);
  expect(screen.getByRole("button", {name: "Pin Riley for me"})).toHaveAttribute("aria-pressed", "false");
});

it("focuses shared content automatically while letting this viewer choose the gallery", () => {
  const share = video(Track.Source.ScreenShare);
  const {rerender} = render(<CallParticipantGallery {...base} videos={[share]} />);
  expect(screen.getByRole("article", {name: "Riley · screen"})).toHaveClass("col-span-full");
  expect(screen.getByRole("article", {name: "Casey (you)"})).toHaveClass("max-h-44");
  fireEvent.click(screen.getByRole("button", {name: "Show everyone equally"}));
  rerender(<CallParticipantGallery {...base} videos={[share]} />);
  expect(screen.getByRole("article", {name: "Riley · screen"})).not.toHaveClass("col-span-full");
  expect(share.track.attach).toHaveBeenCalledTimes(1);
});

it("never focuses a stale share belonging to someone who has left", () => {
  render(<CallParticipantGallery {...base} participants={[people[0]]} videos={[video(Track.Source.ScreenShare)]} />);
  expect(screen.queryByRole("button", {name: "Show everyone equally"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Riley screen")).not.toBeInTheDocument();
});

it("renders the local presentation independently from the local camera", () => {
  const share = {...video(Track.Source.ScreenShare), identity: "me"};
  render(<CallParticipantGallery {...base} localCameraOn={false} videos={[share]} />);
  expect(screen.getByLabelText("Your camera")).toHaveClass("invisible");
  expect(screen.getByLabelText("Casey screen")).toHaveClass("object-contain");
  expect(share.track.attach).toHaveBeenCalledWith(screen.getByLabelText("Casey screen"));
});
