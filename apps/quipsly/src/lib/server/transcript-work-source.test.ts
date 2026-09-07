import { transcriptWorkSource } from "./transcript-work-source";

describe("transcript work source identity", () => {
  it("retains the recording without claiming that playback is ready", () => {
    expect(transcriptWorkSource({ gate: { allowed: true }, recording: { id: "recording" }, playback: null }))
      .toEqual({ recordingAssetId: "recording", playbackSourceId: null });
  });

  it("keeps an available playback binding alongside its recording", () => {
    expect(transcriptWorkSource({ gate: { allowed: true }, recording: { id: "recording" },
      playback: { recordingAssetId: "recording", sourceId: "player" } }))
      .toEqual({ recordingAssetId: "recording", playbackSourceId: "player" });
  });

  it("does not cross a denied processing boundary or invent a recording", () => {
    expect(transcriptWorkSource({ gate: { allowed: false }, recording: { id: "recording" } })).toBeNull();
    expect(transcriptWorkSource({ gate: { allowed: true }, recording: null, playback: null })).toBeNull();
  });

  it("rejects a playback binding for a different recording", () => {
    expect(transcriptWorkSource({ gate: { allowed: true }, recording: { id: "recording" },
      playback: { recordingAssetId: "another-recording", sourceId: "player" } })).toBeNull();
  });
});
