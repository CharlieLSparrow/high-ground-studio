import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import RecorderDashboard from "./page";

function response(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);
}

function productionState(recordingRoomJson: unknown = null) {
  return {
    ok: true,
    mode: "database",
    id: "production-recorder-race",
    projectSlug: "qa-retained-project",
    slug: "qa-retained-episode",
    title: "QA Retained Episode",
    boundaryLabel: "QA Retained Episode",
    status: "active",
    recordingRoomJson,
    updatedAt: "2026-07-31T20:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("Recorder canonical hydration boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/recorder?project=qa-retained-project&episode=qa-retained-episode");
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps editing controls sealed until the canonical recording room has hydrated", async () => {
    const canonicalHydration = deferred<Response>();
    let requestCount = 0;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(() => {
        requestCount += 1;
        if (requestCount === 1) return response(productionState());
        if (requestCount === 2) return canonicalHydration.promise;
        return response(productionState());
      }),
    });

    render(<RecorderDashboard />);

    expect(await screen.findByRole("heading", { name: "Checking Nest access…" })).toBeInTheDocument();
    await waitFor(() => expect(requestCount).toBe(2));
    expect(screen.queryByLabelText("Episode manuscript")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add clip" })).not.toBeInTheDocument();

    await act(async () => {
      canonicalHydration.resolve(await response(productionState({
        payloadVersion: 2,
        roomName: "Canonical retained room",
        script: "Canonical manuscript loaded before editing.",
        producerNotes: "Canonical notes",
        clips: [],
        events: [],
        tracks: [],
        savedAt: "2026-07-31T20:00:00.000Z",
      })));
    });

    expect(await screen.findByRole("heading", { name: "Canonical retained room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Episode manuscript")).toHaveValue("Canonical manuscript loaded before editing.");
    expect(screen.getByRole("button", { name: "Add clip" })).toBeInTheDocument();
  });

  it("still routes a source-less recorder visit to Nest selection", async () => {
    window.history.replaceState({}, "", "/recorder");
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(() => response(productionState())),
    });

    render(<RecorderDashboard />);

    expect(await screen.findByRole("heading", {
      name: "Choose where this session belongs before recording.",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Nests" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Episode manuscript")).not.toBeInTheDocument();
  });

  it("holds a recording when the selected browser input returns exact digital zero", async () => {
    const stop = jest.fn();
    const getSettings = jest.fn(() => ({
      sampleRate: 48_000,
      channelCount: 2,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }));
    const audioTrack = { label: "MOTIV Mix Virtual", getSettings };
    const mediaStream = {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [audioTrack],
    };
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: jest.fn(async () => [{
          kind: "audioinput",
          deviceId: "motiv-virtual",
          groupId: "motiv",
          label: "MOTIV Mix Virtual",
          toJSON: () => ({}),
        }]),
        getUserMedia: jest.fn(async () => mediaStream),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    const analyser = {
      fftSize: 2048,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((samples: Float32Array) => samples.fill(0)),
    };
    const close = jest.fn(async () => undefined);
    class MockAudioContext {
      state = "running";
      createMediaStreamSource() {
        return { connect: jest.fn() };
      }
      createAnalyser() {
        return analyser;
      }
      resume = jest.fn(async () => undefined);
      close = close;
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: MockAudioContext });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn(() => 1),
    });
    const mediaRecorderConstructor = jest.fn();
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: mediaRecorderConstructor });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(() => response(productionState({
        payloadVersion: 2,
        roomName: "Audio preflight room",
        script: "Verify the microphone before this take.",
        producerNotes: "",
        clips: [],
        events: [],
        tracks: [],
        savedAt: "2026-08-04T21:00:00.000Z",
      }))),
    });

    render(<RecorderDashboard />);
    const startButton = await screen.findByRole("button", { name: "Start recording" });
    fireEvent.click(startButton);

    expect(await screen.findByText("Digital silence", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getAllByText(/every measured sample is exactly zero/i)).toHaveLength(2);
    expect(screen.getByText(/MOTIV Mix Virtual · 48,000 Hz · 2 ch/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record anyway" })).toBeInTheDocument();
    expect(mediaRecorderConstructor).not.toHaveBeenCalled();
  });
});
