/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { newestCoherentRecordingTake, stableJson } from "./session-recording-share";

describe("Session recording share take selection", () => {
  it("keeps repeated calls in one room out of the newest take", () => {
    const at = (id: string, seconds: number) => ({ id, recordedStartedAt: new Date(1_787_180_000_000 + seconds * 1_000), captureGroupId: "same-room-group" });
    const newest = newestCoherentRecordingTake([
      at("coach-old", 0),
      at("client-old", 0.02),
      at("coach-new", 180),
      at("client-new", 180.03),
    ]);
    expect(newest.map((source) => source.id)).toEqual(["coach-new", "client-new"]);
  });

  it("keeps normal endpoint startup skew in one take", () => {
    const newest = newestCoherentRecordingTake([
      { id: "coach", recordedStartedAt: new Date("2026-08-19T12:00:00Z") },
      { id: "client", recordedStartedAt: new Date("2026-08-19T12:00:18Z") },
    ]);
    expect(newest).toHaveLength(2);
  });

  it("canonicalizes object fields independent of insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });
});
