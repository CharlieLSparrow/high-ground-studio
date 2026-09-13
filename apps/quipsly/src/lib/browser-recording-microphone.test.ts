import { BrowserRecordingMicrophone } from "./browser-recording-microphone";

function source() {
  const audio = {enabled: true, stop: jest.fn()};
  const video = {enabled: true, stop: jest.fn()};
  return {audio, video, stream: {getAudioTracks: () => [audio], getVideoTracks: () => [video]} as unknown as MediaStream};
}

it("silences only microphone samples without stopping the stream or its camera", () => {
  const controller = new BrowserRecordingMicrophone();
  const {stream, audio, video} = source();
  controller.attach(stream);
  controller.setMuted(true);
  expect(audio.enabled).toBe(false);
  expect(video.enabled).toBe(true);
  expect(audio.stop).not.toHaveBeenCalled();
  controller.setMuted(false);
  expect(audio.enabled).toBe(true);
});

it("honors mute chosen before a recording or while permission is pending", () => {
  const controller = new BrowserRecordingMicrophone();
  controller.setMuted(true);
  const first = source();
  controller.attach(first.stream);
  expect(first.audio.enabled).toBe(false);
  controller.detach(first.stream);
  const second = source();
  controller.attach(second.stream);
  controller.detach(first.stream); // A late teardown cannot detach a newer take.
  controller.setMuted(false);
  expect(second.audio.enabled).toBe(true);
  expect(first.audio.enabled).toBe(false);
});

it("notifies the recording UI synchronously and releases subscriptions", () => {
  const controller = new BrowserRecordingMicrophone();
  const observed: boolean[] = [];
  const unsubscribe = controller.subscribe(() => observed.push(controller.getMuted()));
  controller.setMuted(true);
  unsubscribe();
  controller.setMuted(false);
  expect(observed).toEqual([true]);
});
