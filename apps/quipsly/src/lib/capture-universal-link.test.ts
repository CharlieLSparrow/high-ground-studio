import { captureUniversalLink } from "./capture-universal-link";

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
});
