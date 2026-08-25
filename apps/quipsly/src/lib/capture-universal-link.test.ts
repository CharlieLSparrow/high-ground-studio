import { captureAppDeepLink, captureUniversalLink } from "./capture-universal-link";

describe("captureUniversalLink", () => {
  it("builds an HTTPS Session link that can open Capture or fall back to Nest", () => {
    expect(captureUniversalLink("room-safe_42")).toBe(
      "https://nest.quipsly.com/sessions/room-safe_42?open=capture&mode=live",
    );
  });

  it("encodes the opaque Session identifier and never carries authority", () => {
    const url = new URL(captureUniversalLink("room with spaces"));
    expect(url.pathname).toBe("/sessions/room%20with%20spaces");
    expect([...url.searchParams.keys()]).toEqual(["open", "mode"]);
  });

  it("builds the registered app scheme for an explicit same-site launch", () => {
    expect(captureAppDeepLink("room-safe_42")).toBe(
      "quipsly://session/room-safe_42?mode=live",
    );
    expect(captureAppDeepLink("room/with spaces")).toBe(
      "quipsly://session/room%2Fwith%20spaces?mode=live",
    );
  });
});
