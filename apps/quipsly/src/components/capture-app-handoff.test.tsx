import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  const originalUserAgent = window.navigator.userAgent;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
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
        sessionTitle="Client coaching check-in"
        joinedFromInvitation
        onContinueInBrowser={onContinueInBrowser}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Client coaching check-in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Client coaching check-in" }),
    ).toHaveAttribute("data-session-entry-ready", "true");
    expect(screen.getByRole("button", { name: "Continue in this browser" })).toBeInTheDocument();
    expect(screen.getByText(/recommended on this device/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Use Quipsly Capture on iPhone or iPad/i })).toHaveAttribute(
      "href",
      "quipsly://session/room-safe_42?mode=live",
    );
    expect(
      screen.getByRole("link", { name: /Get Quipsly Capture for iPhone or iPad/i }),
    ).toHaveAttribute("href", "https://testflight.apple.com/join/XwRRcYUm");
    expect(
      screen.getByText(/same private Session/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/laptop/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue in this browser" }));
    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
  });

  it("makes Capture the one-tap recommendation on iPhone and keeps browser entry secondary", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)",
    });

    render(<CaptureAppHandoff roomId="room-iphone" />);

    expect(screen.getByText("Recommended on this iPhone")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Quipsly Capture" })).toHaveAttribute(
      "href",
      "quipsly://session/room-iphone?mode=live",
    );
    expect(screen.getByRole("button", { name: "Join in browser" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Continue in this browser" }));
    expect(window.localStorage.getItem("quipsly.session-entry-preference.v1")).toBe("BROWSER");
    first.unmount();

    const nextContinue = jest.fn();
    render(<CaptureAppHandoff roomId="room-next" onContinueInBrowser={nextContinue} />);
    expect(await screen.findByText("Continue in this browser")).toBeInTheDocument();
    expect(nextContinue).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/recommended on this device/i)).not.toBeInTheDocument();
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

  it("recovers in place when an iPhone app handoff falls back to the browser", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/sessions/room-fallback?open=capture&mode=live");
    window.localStorage.setItem("quipsly.session-entry-preference.v1", "CAPTURE_APP");
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as typeof fetch;
    const onContinueInBrowser = jest.fn();

    render(
      <CaptureAppHandoff
        roomId="room-fallback"
        captureOpenFallback
        onContinueInBrowser={onContinueInBrowser}
      />,
    );

    expect(screen.getByText("Capture didn’t open")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Install or update Capture" })).toHaveAttribute(
      "href",
      "https://testflight.apple.com/join/XwRRcYUm",
    );
    expect(screen.getByRole("link", { name: "Try Capture again" })).toHaveAttribute(
      "href",
      "quipsly://session/room-fallback?mode=live",
    );
    expect(window.localStorage.getItem("quipsly.session-entry-preference.v1")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Join in this browser" }));
    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.has("open")).toBe(false);
    expect(window.localStorage.getItem("quipsly.session-entry-preference.v1")).toBe("BROWSER");
  });
});
