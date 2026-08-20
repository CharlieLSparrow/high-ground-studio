import {
  browserSourceCanBegin,
  browserSourceFileExtension,
  browserSourceNextUploadChunk,
  browserSourcePersistedBytes,
  chooseBrowserSourceMimeType,
} from "@high-ground/quipsly-domain";

describe("browser source capture contract", () => {
  test("selects the first browser-supported production container", () => {
    expect(
      chooseBrowserSourceMimeType("audio", (value) => value === "audio/mp4"),
    ).toBe("audio/mp4");
    expect(
      chooseBrowserSourceMimeType("video", (value) => value.includes("vp8")),
    ).toBe("video/webm;codecs=vp8,opus");
  });

  test("never presents recording as ready without durable storage and consent", () => {
    expect(
      browserSourceCanBegin({
        opfsAvailable: false,
        microphoneId: "mic",
        sourceType: "audio",
        recordingConsentId: "consent",
        allPartyConsentReady: true,
        headphonesAttested: true,
      }),
    ).toEqual({ ok: false, reason: "Durable browser storage is unavailable." });

    expect(
      browserSourceCanBegin({
        opfsAvailable: true,
        microphoneId: "mic",
        sourceType: "audio",
        recordingConsentId: null,
        allPartyConsentReady: false,
        headphonesAttested: true,
      }).ok,
    ).toBe(false);

    expect(
      browserSourceCanBegin({
        opfsAvailable: true,
        roomStatus: "ENDED",
        microphoneId: "mic",
        sourceType: "audio",
        recordingConsentId: "consent",
        allPartyConsentReady: true,
        headphonesAttested: true,
      }),
    ).toEqual({
      ok: false,
      reason:
        "This Session is closed. Reopen it before recording another take.",
    });
  });

  test("requires a camera for video but treats headphones as guidance", () => {
    expect(
      browserSourceCanBegin({
        opfsAvailable: true,
        microphoneId: "mic",
        sourceType: "video",
        cameraId: "",
        recordingConsentId: "consent",
        allPartyConsentReady: true,
        headphonesAttested: true,
      }).reason,
    ).toBe("Choose a camera.");

    expect(
      browserSourceCanBegin({
        opfsAvailable: true,
        microphoneId: "mic",
        sourceType: "audio",
        recordingConsentId: "consent",
        allPartyConsentReady: true,
        headphonesAttested: true,
      }).ok,
    ).toBe(true);

    expect(
      browserSourceCanBegin({
        opfsAvailable: true,
        microphoneId: "mic",
        sourceType: "audio",
        recordingConsentId: "consent",
        allPartyConsentReady: true,
        headphonesAttested: false,
      }).ok,
    ).toBe(true);
  });

  test("uses honest extensions for browser containers", () => {
    expect(browserSourceFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(browserSourceFileExtension("audio/mp4")).toBe("m4a");
    expect(browserSourceFileExtension("video/mp4")).toBe("mp4");
  });

  test("maps GCS range receipts and 8 MiB resumable chunks without overlap", () => {
    expect(browserSourcePersistedBytes("bytes=0-8388607")).toBe(
      8 * 1024 * 1024,
    );
    expect(browserSourcePersistedBytes(null)).toBe(0);
    expect(
      browserSourceNextUploadChunk(20 * 1024 * 1024, 8 * 1024 * 1024),
    ).toEqual({
      start: 8 * 1024 * 1024,
      endExclusive: 16 * 1024 * 1024,
      endInclusive: 16 * 1024 * 1024 - 1,
      sizeBytes: 8 * 1024 * 1024,
    });
    expect(
      browserSourceNextUploadChunk(20 * 1024 * 1024, 20 * 1024 * 1024),
    ).toBeNull();
  });
});
