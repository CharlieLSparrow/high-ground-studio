import { nestCallbackPath } from "./nest-sign-in-gate";

describe("nestCallbackPath", () => {
  it("returns a coach to the exact coaching surface", () => {
    expect(nestCallbackPath("/coaching", "")).toBe("/coaching");
  });

  it("preserves a session invitation without hard-coding Projects", () => {
    expect(nestCallbackPath("/sessions/join", "token=qsinv_safe-token")).toBe(
      "/sessions/join?token=qsinv_safe-token",
    );
  });

  it("fails closed for an unsafe external-looking path", () => {
    expect(nestCallbackPath("//example.com/steal", "x=1")).toBe("/projects?x=1");
  });
});
