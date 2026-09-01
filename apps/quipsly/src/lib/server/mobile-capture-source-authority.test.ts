import { mobileCaptureRequiresFreshRoomAuthorization } from "./mobile-capture-source-authority";

describe("mobile capture source authority", () => {
  it("holds a recent-device-consent source until its room start is current", () => {
    expect(mobileCaptureRequiresFreshRoomAuthorization({
      captureAuthorityBasis: "recent-device-consent",
    })).toBe(true);
  });

  it.each([
    { captureAuthorityBasis: "authoritative-refresh" },
    { captureAuthorityBasis: "local-draft" },
    { captureAuthorityBasis: "preview" },
    {},
    null,
    "recent-device-consent",
  ])("does not add the offline hold to $captureAuthorityBasis", (profile) => {
    expect(mobileCaptureRequiresFreshRoomAuthorization(profile)).toBe(false);
  });
});
