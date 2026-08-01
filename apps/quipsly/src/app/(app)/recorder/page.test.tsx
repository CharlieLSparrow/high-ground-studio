import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

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
});
