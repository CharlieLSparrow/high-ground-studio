/** @jest-environment node */

import { transcriptRetryDisposition } from "./capture-transcripts";

describe("immutable transcript versioning", () => {
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
