import { timelineSaveDisposition } from "./timeline-save-receipt-policy";

describe("timeline save receipt policy", () => {
  it("treats identical bytes without reviewed draft links as a no-op", () => {
    expect(timelineSaveDisposition({
      currentFingerprint: "same",
      incomingFingerprint: "same",
      linkedReviewReceiptIds: [],
    })).toBe("NO_OP");
  });

  it("allows identical bytes to link explicit reviewed draft actions", () => {
    expect(timelineSaveDisposition({
      currentFingerprint: "same",
      incomingFingerprint: "same",
      linkedReviewReceiptIds: ["draft-review-1"],
    })).toBe("LINK_REVIEWED_DRAFT");
  });

  it("writes when canonical and incoming bytes differ", () => {
    expect(timelineSaveDisposition({
      currentFingerprint: "before",
      incomingFingerprint: "after",
      linkedReviewReceiptIds: [],
    })).toBe("WRITE_TIMELINE");
  });
});
