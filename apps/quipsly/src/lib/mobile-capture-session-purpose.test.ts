import {
  fallbackTitleForMobileCapturePurpose,
  parseMobileCaptureSessionPurpose,
} from "./mobile-capture-session-purpose";

describe("mobile capture Session purpose", () => {
  it("preserves a personal voice note instead of silently turning it into coaching", () => {
    expect(parseMobileCaptureSessionPurpose("PERSONAL_NOTE")).toBe("PERSONAL_NOTE");
    expect(parseMobileCaptureSessionPurpose("voice note")).toBe("PERSONAL_NOTE");
    expect(parseMobileCaptureSessionPurpose("FIELD_NOTE")).toBe("PERSONAL_NOTE");
    expect(fallbackTitleForMobileCapturePurpose("PERSONAL_NOTE")).toBe("Voice note");
  });

  it("rejects unknown and absent purposes instead of assigning them to coaching", () => {
    expect(parseMobileCaptureSessionPurpose("future-session-kind")).toBeNull();
    expect(parseMobileCaptureSessionPurpose(42)).toBeNull();
    expect(parseMobileCaptureSessionPurpose(undefined)).toBeNull();
  });
});
