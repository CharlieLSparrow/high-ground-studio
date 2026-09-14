/** @jest-environment node */

import { transcriptRetryDisposition } from "./capture-transcripts";

describe("immutable transcript versioning", () => {
  it("retries empty completion as a new version instead of replaying the same empty result", () => {
    expect(transcriptRetryDisposition({status: "COMPLETED", segmentCount: 0, wordCount: 0})).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({status: "COMPLETED", segmentCount: 0, wordCount: 2})).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({status: "COMPLETED", segmentCount: 2, wordCount: 0})).toBe("REUSE");
    expect(transcriptRetryDisposition({status: "COMPLETED"})).toBe("REUSE");
  });
  it("creates a new version whenever immutable provider evidence exists", () => {
    expect(transcriptRetryDisposition({
      status: "FAILED",
      segmentCount: 3,
      wordCount: 0,
    })).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({
      status: "HELD",
      segmentCount: 0,
      wordCount: 4,
    })).toBe("CREATE_VERSION");
    expect(transcriptRetryDisposition({
      status: "FAILED",
      segmentCount: 0,
      wordCount: 0,
    })).toBe("REQUEUE");
    expect(transcriptRetryDisposition({
      status: "QUEUED",
      segmentCount: 0,
      wordCount: 0,
    })).toBe("REUSE");
    expect(transcriptRetryDisposition(null)).toBe("CREATE");
  });
});
