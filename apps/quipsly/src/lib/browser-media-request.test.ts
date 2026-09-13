/** @jest-environment jsdom */
import { requestBrowserMedia } from "./browser-media-request";

describe("browser device permission lifecycle", () => {
  it("waits for a person's permission rather than failing after fifteen seconds", async () => {
    jest.useFakeTimers();
    try {
      let allow!: (stream: MediaStream) => void;
      const media = { getUserMedia: jest.fn(() => new Promise<MediaStream>(resolve => { allow = resolve; })) };
      const controller = new AbortController();
      const request = requestBrowserMedia(media, { audio: true }, controller.signal);
      const resolved = jest.fn();
      void request.then(resolved);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(120_000);
      expect(resolved).not.toHaveBeenCalled();
      const stream = { getTracks: () => [] } as unknown as MediaStream;
      allow(stream);
      await expect(request).resolves.toBe(stream);
    } finally { jest.useRealTimers(); }
  });

  it("cancels immediately and stops media that arrives after the lobby is gone", async () => {
    let allow!: (stream: MediaStream) => void;
    const media = { getUserMedia: jest.fn(() => new Promise<MediaStream>(resolve => { allow = resolve; })) };
    const controller = new AbortController();
    const request = requestBrowserMedia(media, { audio: true, video: true }, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await rejected;
    const audio = { stop: jest.fn() }, video = { stop: jest.fn() };
    allow({ getTracks: () => [audio, video] } as unknown as MediaStream);
    await Promise.resolve(); await Promise.resolve();
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(video.stop).toHaveBeenCalledTimes(1);
  });

  it("does not open devices for an already-cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    const media = { getUserMedia: jest.fn() };
    await expect(requestBrowserMedia(media, { audio: true }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(media.getUserMedia).not.toHaveBeenCalled();
  });

  it("preserves a browser denial and does not close successfully handed-off tracks", async () => {
    const denied = new DOMException("Permission denied", "NotAllowedError");
    await expect(requestBrowserMedia({ getUserMedia: jest.fn().mockRejectedValue(denied) }, { audio: true }, new AbortController().signal)).rejects.toBe(denied);
    const stop = jest.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const controller = new AbortController();
    await expect(requestBrowserMedia({ getUserMedia: jest.fn().mockResolvedValue(stream) }, { audio: true }, controller.signal)).resolves.toBe(stream);
    controller.abort();
    expect(stop).not.toHaveBeenCalled();
  });
});
