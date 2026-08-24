import {
  browserSourceRecordingSegments,
  type BrowserSourceCaptureLedger,
} from "@high-ground/quipsly-domain";

describe("browser source recording segments", () => {
  it("projects call transport gaps beside chunk timing without adding media duration", () => {
    const ledger = {
      chunks: [{
        index: 0,
        byteOffset: 0,
        sizeBytes: 512,
        recorderTimecodeMs: 2_000,
        receivedAt: "2026-08-24T18:00:02.000Z",
      }],
      callTransportGaps: [{
        startedAt: "2026-08-24T18:00:12.250Z",
        stoppedAt: "2026-08-24T18:00:19.750Z",
        detail: "Call transport unavailable for 7.50 seconds. Listen to verify the retained browser source.",
      }],
    } as unknown as BrowserSourceCaptureLedger;

    expect(browserSourceRecordingSegments(ledger)).toEqual({
      version: 1,
      clock: "browser-media-recorder-timecode",
      chunks: [expect.objectContaining({ index: 0, sizeBytes: 512 })],
      timelineEvents: [{
        status: "timeline-gap",
        startedAt: "2026-08-24T18:00:12.250Z",
        stoppedAt: "2026-08-24T18:00:19.750Z",
        durationSeconds: 0,
        stopReason: "call-transport-gap",
        boundaryDetail: expect.stringMatching(/listen to verify/i),
      }],
    });
  });
});
