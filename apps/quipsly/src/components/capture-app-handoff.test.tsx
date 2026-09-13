import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptureAppHandoff } from "./capture-app-handoff";

describe("CaptureAppHandoff", () => {
  const originalUserAgent = navigator.userAgent;
  const originalMaxTouchPoints = navigator.maxTouchPoints;
  const key = "quipsly.session-entry-preference.v1";

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: originalMaxTouchPoints });
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof fetch;
  });
  afterEach(() => jest.restoreAllMocks());

  it("takes a first-time desktop guest directly to the lobby, not a device questionnaire", () => {
    const open = jest.fn();
    const view = render(<CaptureAppHandoff roomId="room-42" sessionTitle="Client check-in" joinedFromInvitation onContinueInBrowser={open} />);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Client check-in" })).toHaveAttribute("data-session-entry-ready", "true");
    expect(screen.queryByText(/Session entry signals|install proof|recommended on/i)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/sessions/room-42/entry-choice", expect.objectContaining({ method: "POST", body: '{"choice":"BROWSER"}' }));
    view.rerender(<CaptureAppHandoff roomId="room-42" onContinueInBrowser={open} />);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)", 1],
    ["iPad", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5],
  ])("keeps an explicit app or browser choice on %s", async (_device, userAgent, touchPoints) => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touchPoints });
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room-mobile" onContinueInBrowser={open} />);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open Quipsly Capture" })).toHaveAttribute("href", "quipsly://session/room-mobile?mode=live");
    await userEvent.setup().click(screen.getByRole("button", { name: "Open call lobby" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBe("BROWSER");
  });

  it("honors a remembered app preference without launching another app automatically", () => {
    localStorage.setItem(key, "CAPTURE_APP");
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room-app" onContinueInBrowser={open} />);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open Quipsly Capture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open call lobby" })).toBeInTheDocument();
  });

  it("honors an explicit browser link over a saved app preference", () => {
    localStorage.setItem(key, "CAPTURE_APP");
    window.history.replaceState({}, "", "/sessions/room?mode=live&entry=browser");
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room" onContinueInBrowser={open} />);
    expect(open).toHaveBeenCalledTimes(1);
    expect(new URL(location.href).searchParams.has("entry")).toBe(false);
    expect(localStorage.getItem(key)).toBe("BROWSER");
  });

  it("does not reopen a dismissed lobby until the person asks", async () => {
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room" allowAutomaticBrowserEntry={false} onContinueInBrowser={open} />);
    expect(open).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Open call lobby" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens a different session when the same entry component is reused", () => {
    const open = jest.fn();
    const view = render(<CaptureAppHandoff roomId="room-one" onContinueInBrowser={open} />);
    view.rerender(<CaptureAppHandoff roomId="room-two" onContinueInBrowser={open} />);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("can still enter when browser storage and analytics are unavailable", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Offline")) as typeof fetch;
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room" onContinueInBrowser={open} allowAutomaticBrowserEntry={false} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Open call lobby" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("recovers a failed app handoff without a dead end or surprise browser join", async () => {
    localStorage.setItem(key, "CAPTURE_APP");
    window.history.replaceState({}, "", "/sessions/room?open=capture&mode=live");
    const open = jest.fn();
    render(<CaptureAppHandoff roomId="room" captureOpenFallback onContinueInBrowser={open} />);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText(/Capture didn’t open/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try Capture again" })).toHaveAttribute("href", "quipsly://session/room?mode=live");
    expect(screen.getByRole("link", { name: "Install or update Capture" })).toHaveAttribute("href", "https://testflight.apple.com/join/XwRRcYUm");
    expect(localStorage.getItem(key)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Join in this browser" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(new URL(location.href).searchParams.has("open")).toBe(false);
  });
});
