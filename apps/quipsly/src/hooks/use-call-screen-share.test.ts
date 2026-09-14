import { act, renderHook } from "@testing-library/react";
import { ConnectionState, Track, type LocalTrack, type Room } from "livekit-client";
import { useCallScreenShare } from "./use-call-screen-share";

function source(kind = Track.Kind.Video) {
  const media = new EventTarget();
  Object.assign(media, {id: `screen-${kind}`, readyState: "live"});
  return {kind, source: kind === Track.Kind.Video ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio,
    mediaStreamTrack: media, stop: jest.fn()} as unknown as LocalTrack;
}
function room(tracks = [source()]) {
  return {state: ConnectionState.Connected, localParticipant: {identity: "coach",
    createScreenTracks: jest.fn().mockResolvedValue(tracks), publishTrack: jest.fn().mockResolvedValue({}),
    unpublishTrack: jest.fn().mockResolvedValue(undefined)}} as unknown as Room;
}
const mediaDevices = navigator.mediaDevices;
beforeEach(() => Object.defineProperty(navigator, "mediaDevices", {configurable: true, value: {getDisplayMedia: jest.fn()}}));
afterEach(() => Object.defineProperty(navigator, "mediaDevices", {configurable: true, value: mediaDevices}));

it("publishes only chosen presentation tracks and stops both video and tab audio", async () => {
  const tracks = [source(), source(Track.Kind.Audio)]; const owner = room(tracks);
  const {result} = renderHook(() => useCallScreenShare(owner));
  await act(() => result.current.start());
  expect(owner.localParticipant.createScreenTracks).toHaveBeenCalledWith(expect.objectContaining({audio: true, selfBrowserSurface: "exclude", systemAudio: "exclude"}));
  expect(owner.localParticipant.publishTrack).toHaveBeenCalledWith(tracks[0], {source: Track.Source.ScreenShare});
  expect(owner.localParticipant.publishTrack).toHaveBeenCalledWith(tracks[1], {source: Track.Source.ScreenShareAudio});
  expect(result.current.sharing).toBe(true);
  expect(result.current.videos).toHaveLength(1);
  await act(() => result.current.stop());
  expect(result.current.sharing).toBe(false);
  tracks.forEach(track => expect(track.stop).toHaveBeenCalled());
});

it("does not publish a picker result after cancellation", async () => {
  const owner = room(); const tracks = [source()];
  let resolve!: (tracks: LocalTrack[]) => void;
  jest.mocked(owner.localParticipant.createScreenTracks).mockReturnValue(new Promise(done => {resolve = done;}));
  const {result} = renderHook(() => useCallScreenShare(owner));
  let pending!: Promise<void>;
  act(() => {pending = result.current.start();});
  expect(result.current.busy).toBe(true);
  await act(() => result.current.stop());
  await act(async () => {resolve(tracks); await pending;});
  expect(owner.localParticipant.publishTrack).not.toHaveBeenCalled();
  expect(tracks[0].stop).toHaveBeenCalled();
  expect(result.current.sharing).toBe(false);
});

it("stops a presentation if the browser's Stop sharing control ends its track", async () => {
  const tracks = [source(), source(Track.Kind.Audio)]; const owner = room(tracks);
  const {result} = renderHook(() => useCallScreenShare(owner));
  await act(() => result.current.start());
  await act(async () => {tracks[0].mediaStreamTrack.dispatchEvent(new Event("ended"));});
  expect(result.current.sharing).toBe(false);
  tracks.forEach(track => expect(track.stop).toHaveBeenCalled());
});

it("releases screen tracks on leave and rejects late results for the old room", async () => {
  const owner = room(); const tracks = [source()];
  let resolve!: (tracks: LocalTrack[]) => void;
  jest.mocked(owner.localParticipant.createScreenTracks).mockReturnValue(new Promise(done => {resolve = done;}));
  const {result, rerender} = renderHook(({active}: {active: Room | null}) => useCallScreenShare(active), {initialProps: {active: owner as Room | null}});
  let pending!: Promise<void>;
  act(() => {pending = result.current.start();});
  rerender({active: null});
  await act(async () => {resolve(tracks); await pending;});
  expect(owner.localParticipant.publishTrack).not.toHaveBeenCalled();
  expect(tracks[0].stop).toHaveBeenCalled();
});

it("treats picker dismissal as normal and allows retry", async () => {
  const owner = room();
  jest.mocked(owner.localParticipant.createScreenTracks).mockRejectedValueOnce(new DOMException("Dismissed", "NotAllowedError"));
  const {result} = renderHook(() => useCallScreenShare(owner));
  await act(() => result.current.start());
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
  await act(() => result.current.start());
  expect(result.current.sharing).toBe(true);
});

it("cleans up a failed publication without touching other call media", async () => {
  const tracks = [source(), source(Track.Kind.Audio)]; const owner = room(tracks);
  jest.mocked(owner.localParticipant.publishTrack).mockRejectedValueOnce(new Error("Disconnected"));
  const {result} = renderHook(() => useCallScreenShare(owner));
  await act(() => result.current.start());
  tracks.forEach(track => expect(track.stop).toHaveBeenCalled());
  expect(result.current.error).toContain("call is still connected");
  expect(result.current.sharing).toBe(false);
});

it("does not resurrect sharing when the browser ends capture during publication", async () => {
  const tracks = [source(), source(Track.Kind.Audio)]; const owner = room(tracks);
  let resolve!: () => void;
  jest.mocked(owner.localParticipant.publishTrack).mockReturnValueOnce(new Promise(done => {resolve = () => done({} as never);}));
  const {result} = renderHook(() => useCallScreenShare(owner));
  let pending!: Promise<void>;
  await act(async () => {pending = result.current.start();});
  expect(owner.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
  await act(async () => {tracks[0].mediaStreamTrack.dispatchEvent(new Event("ended"));});
  await act(async () => {resolve(); await pending;});
  expect(owner.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
  expect(result.current.sharing).toBe(false);
  expect(result.current.busy).toBe(false);
  tracks.forEach(track => expect(track.stop).toHaveBeenCalled());
});
