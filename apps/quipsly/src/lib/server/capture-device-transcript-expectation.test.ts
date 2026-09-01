/** @jest-environment node */

import {
  captureDeviceTranscriptExpectation,
  captureDeviceTranscriptGraceSeconds,
  parseCaptureDeviceTranscriptExpectation,
} from "./capture-device-transcript-expectation";

jest.mock("server-only", () => ({}));

describe("device-first transcript expectation", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("allows a short recording thirty minutes before automatic cloud fallback", () => {
    const expectation = captureDeviceTranscriptExpectation({
      actorUserId: "coach-1",
      actorEmail: "Coach@Example.test",
      startedAt: "2026-09-01T11:55:00.000Z",
      stoppedAt: "2026-09-01T12:00:00.000Z",
      now,
    });

    expect(expectation).toMatchObject({
      expected: true,
      state: "awaiting-device",
      actorEmail: "coach@example.test",
      expectedAt: "2026-09-01T12:00:00.000Z",
      fallbackAfter: "2026-09-01T12:30:00.000Z",
      graceSeconds: 1_800,
      recordingDurationSeconds: 300,
    });
    expect(parseCaptureDeviceTranscriptExpectation({
      deviceTranscriptExpectation: expectation,
    })).toEqual(expectation);
  });

  it("gives long recordings proportional local-processing time capped at six hours", () => {
    expect(captureDeviceTranscriptGraceSeconds(3_600)).toBe(8_100);
    expect(captureDeviceTranscriptGraceSeconds(24 * 3_600)).toBe(21_600);
  });

  it("preserves the first fallback deadline across finalization replays", () => {
    const first = captureDeviceTranscriptExpectation({
      actorUserId: "coach-1",
      actorEmail: "coach@example.test",
      now,
    });
    const replay = captureDeviceTranscriptExpectation({
      actorUserId: "coach-1",
      actorEmail: "coach@example.test",
      priorResultJson: { deviceTranscriptExpectation: first },
      now: new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(replay?.expectedAt).toBe(first?.expectedAt);
    expect(replay?.fallbackAfter).toBe(first?.fallbackAfter);
  });

  it("does not create an unserviceable expectation without an accountable actor", () => {
    expect(captureDeviceTranscriptExpectation({
      actorUserId: "coach-1",
      now,
    })).toBeNull();
  });
});
