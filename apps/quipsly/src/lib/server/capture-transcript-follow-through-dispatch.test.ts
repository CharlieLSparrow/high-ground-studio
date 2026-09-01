/** @jest-environment node */

import { after } from "next/server";

import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import { dispatchCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through-dispatch";

jest.mock("server-only", () => ({}));
jest.mock("next/server", () => ({ after: jest.fn() }));
jest.mock("./capture-transcript-follow-through", () => ({
  reconcileCaptureTranscriptFollowThrough: jest.fn(),
}));

describe("capture transcript follow-through dispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("defers packet creation until after the transcript response", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    jest.mocked(after).mockImplementation((callback: any) => {
      callbacks.push(callback);
    });
    const prisma = { transcriptJob: {} };

    dispatchCaptureTranscriptFollowThrough({ prisma, transcriptJobId: "job-1" });

    expect(reconcileCaptureTranscriptFollowThrough).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]!();
    expect(reconcileCaptureTranscriptFollowThrough).toHaveBeenCalledWith({
      prisma,
      transcriptJobId: "job-1",
    });
  });

  it("keeps a retryable packet failure from changing transcript delivery", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    jest.mocked(after).mockImplementation((callback: any) => {
      callbacks.push(callback);
    });
    jest.mocked(reconcileCaptureTranscriptFollowThrough).mockRejectedValue(
      new Error("temporary packet failure"),
    );
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    dispatchCaptureTranscriptFollowThrough({ prisma: {}, transcriptJobId: "job-2" });
    await expect(callbacks[0]!()).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[Capture Follow-through] Immediate dispatch remains retryable",
      { transcriptJobId: "job-2", reason: "temporary packet failure" },
    );
    consoleError.mockRestore();
  });
});
