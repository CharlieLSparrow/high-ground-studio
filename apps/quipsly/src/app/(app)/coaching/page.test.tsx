import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CoachingPage from "./page";

jest.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

const user = {id: "client-1", name: "Riley", email: "riley@example.test", isClient: true, isCoach: false, isStaff: false};
const booking = {id: "booking-1", title: "My retained coaching session", status: "CONFIRMED",
  scheduledStart: "2026-09-20T15:00:00Z", scheduledEnd: "2026-09-20T16:00:00Z", timezone: "America/Denver",
  clientUserId: user.id, client: user, coach: {id: "coach-1", name: "Morgan"},
  liveSessionPath: "/sessions/room-1?mode=live"};
const loaded = {ok: true, user, upcomingBookings: [booking], coaches: [], offerings: [], availabilityWindows: []};

function response(body: unknown, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => body};
}

describe("Coaching home loading and recovery", () => {
  let runwayFetch: jest.Mock;
  beforeEach(() => {
    runwayFetch = jest.fn();
    Object.defineProperty(globalThis, "fetch", {configurable: true, writable: true,
      value: jest.fn((url) => String(url) === "/api/coaching/runway"
        ? runwayFetch()
        : Promise.resolve(response({ok: false}))),
    });
  });

  it("does not invent an empty coach account while the client data is loading", () => {
    runwayFetch.mockReturnValue(new Promise(() => {}));
    render(<CoachingPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your coaching space");
    expect(screen.queryByText(/No sessions are scheduled yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Schedule and send invite"})).not.toBeInTheDocument();
  });

  it.each(["empty response", "network failure"])("recovers from an initial %s without exposing parser errors or claiming there is no work", async (failure) => {
    runwayFetch.mockImplementationOnce(() => failure === "empty response"
      ? Promise.resolve({ok: false, status: 500, json: async () => {throw new SyntaxError("Unexpected end of JSON input");}})
      : Promise.reject(new TypeError("Failed to fetch")))
      .mockResolvedValue(response(loaded));
    render(<CoachingPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your coaching space");
    expect(screen.queryByText(/Unexpected end|Failed to fetch|No sessions are scheduled yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Schedule and send invite"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Try again"}));
    expect(await screen.findByRole("link", {name: "Open my session"})).toHaveAttribute("href", booking.liveSessionPath);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains loaded work during a failed refresh and offers a retry", async () => {
    // The staff refresh control exercises the same loader used after ordinary
    // scheduling and Session updates, without manufacturing private UI state.
    const staffView = {...loaded, user: {...user, isStaff: true}};
    runwayFetch.mockResolvedValueOnce(response(staffView))
      .mockResolvedValueOnce(response(null, 503))
      .mockResolvedValue(response(staffView));
    render(<CoachingPage />);
    fireEvent.click(await screen.findByRole("button", {name: "Refresh operations"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your last loaded sessions are still shown below");
    expect(screen.getAllByRole("heading", {name: booking.title}).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", {name: "Try again"}));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getAllByRole("heading", {name: booking.title}).length).toBeGreaterThan(0);
  });

  it.each([401, 403])("clears retained work when a refresh says access is no longer available (%s)", async (status) => {
    runwayFetch.mockResolvedValueOnce(response({...loaded, user: {...user, isStaff: true}}))
      .mockResolvedValue(response({ok: false}, status));
    render(<CoachingPage />);
    fireEvent.click(await screen.findByRole("button", {name: "Refresh operations"}));
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", {name: booking.title})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Schedule and send invite"})).not.toBeInTheDocument();
    if (status === 401) {
      expect(screen.getByRole("link", {name: "Sign in"})).toHaveAttribute("href", "/login?callbackUrl=%2Fcoaching");
    }
  });
});
