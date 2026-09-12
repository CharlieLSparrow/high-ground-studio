import { captureAudioFrameDuration } from "./capture-source-duration";

const signal = { schemaVersion: 1, algorithm: "quipsly-audio-signal-window-v1", analyzedFrameCount: 467968, sampleRate: 48000 };
test("media duration retains exact frame precision", () => {
  expect(captureAudioFrameDuration({ audioSignal: signal })).toBe(467968 / 48000);
});
test.each([null, {}, { audioSignal: {} }, { audioSignal: { ...signal, sampleRate: 0 } }, { audioSignal: { ...signal, analyzedFrameCount: -1 } }, { audioSignal: { ...signal, algorithm: "unknown" } }])("invalid frame evidence is not used: %p", (input) => {
  expect(captureAudioFrameDuration(input)).toBeNull();
});
