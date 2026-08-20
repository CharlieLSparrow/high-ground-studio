import { render, screen } from "@testing-library/react";

import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  it("hands off only canonical Session identity and promises no implicit authority", () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as typeof fetch;
    const onContinueInBrowser = jest.fn();
    render(
      <CaptureAppHandoff
        roomId="room-safe_42"
        joinedFromInvitation
        onContinueInBrowser={onContinueInBrowser}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Choose how you want to join" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Capture" })).toHaveAttribute(
      "href",
      "quipsly://session/room-safe_42?mode=live",
    );
    expect(
      screen.getByRole("link", { name: "Get iPhone beta" }),
    ).toHaveAttribute("href", "https://testflight.apple.com/join/XwRRcYUm");
    expect(
      screen.getByText(/public TestFlight beta, sign in with the invited/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/link grants no access/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/phone, tablet, or desktop/i)).toBeInTheDocument();
    expect(screen.queryByText(/laptop/i)).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Continue in browser" }).click();
    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
  });
});
