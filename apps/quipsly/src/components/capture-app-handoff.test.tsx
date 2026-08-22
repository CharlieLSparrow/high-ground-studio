import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

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
      screen.getByRole("heading", { name: "Join your Session" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Join your Session" }),
    ).toHaveAttribute("data-session-entry-ready", "true");
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
      screen.getByText(/same private Session/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/continue in this browser/i)).toBeInTheDocument();
    expect(screen.queryByText(/laptop/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use another device" }));
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

  it("remembers browser entry and opens the next Session lobby without another device question", async () => {
    const user = userEvent.setup();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as typeof fetch;
    const firstContinue = jest.fn();
    const first = render(
      <CaptureAppHandoff roomId="room-first" onContinueInBrowser={firstContinue} />,
    );
    await user.click(screen.getByRole("button", { name: /This browser/i }));
    expect(window.localStorage.getItem("quipsly.session-entry-preference.v1")).toBe("BROWSER");
    first.unmount();

    const nextContinue = jest.fn();
    render(<CaptureAppHandoff roomId="room-next" onContinueInBrowser={nextContinue} />);
    expect(await screen.findByText("Continue in this browser")).toBeInTheDocument();
    expect(nextContinue).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/one choice now/i)).not.toBeInTheDocument();
  });

  it("remembers Capture but still requires a user gesture before opening another app", async () => {
    window.localStorage.setItem("quipsly.session-entry-preference.v1", "CAPTURE_APP");
    const onContinueInBrowser = jest.fn();
    render(<CaptureAppHandoff roomId="room-phone" onContinueInBrowser={onContinueInBrowser} />);
    expect(await screen.findByText("Open Quipsly Capture")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Capture" })).toHaveAttribute(
      "href",
      "quipsly://session/room-phone?mode=live",
    );
    expect(onContinueInBrowser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use another device" })).toBeInTheDocument();
  });
});
