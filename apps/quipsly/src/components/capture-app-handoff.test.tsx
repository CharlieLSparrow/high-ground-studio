import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  it("advances in place and hands off only canonical Session identity", async () => {
    const user = userEvent.setup();
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
    expect(screen.queryByRole("link", { name: "Open Capture" })).not.toBeInTheDocument();
    expect(screen.getByText(/one choice now · setup comes next/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /iPhone Capture/i }));
    expect(screen.getByRole("link", { name: "Open Capture" })).toHaveAttribute(
      "href",
      "quipsly://session/room-safe_42?mode=live",
    );
    expect(
      screen.getByRole("link", { name: "Get iPhone beta" }),
    ).toHaveAttribute("href", "https://testflight.apple.com/join/XwRRcYUm");
    expect(
      screen.getByText(/install the public beta, sign in with the invited/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/link grants no access/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/phone, tablet, or desktop/i)).toBeInTheDocument();
    expect(screen.queryByText(/laptop/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change device" }));
    expect(screen.queryByRole("link", { name: "Open Capture" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /This browser/i }));
    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
  });

  it("recovers a browser handoff when the invitation page remounts", () => {
    window.history.replaceState({}, "", "/sessions/room-reload?mode=live&joined=1&entry=browser");
    const onContinueInBrowser = jest.fn();

    render(
      <CaptureAppHandoff
        roomId="room-reload"
        joinedFromInvitation
        onContinueInBrowser={onContinueInBrowser}
      />,
    );

    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.has("entry")).toBe(false);
  });
});
