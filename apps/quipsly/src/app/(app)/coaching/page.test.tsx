import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CoachingPage from "./page";
import { useSearchParams } from "next/navigation";

jest.mock("next/navigation", () => ({useSearchParams: jest.fn(() => new URLSearchParams())}));

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
    jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    runwayFetch = jest.fn();
    Object.defineProperty(globalThis, "fetch", {configurable: true, writable: true,
      value: jest.fn((url) => String(url) === "/api/coaching/runway"
        ? runwayFetch()
        : Promise.resolve(response({ok: false}))),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("offers a standard notify-client choice when moving an existing appointment", async () => {
    const coachView = {...loaded, user: {...user, id: "coach-1", isCoach: true, isClient: false}};
    runwayFetch.mockResolvedValue(response(coachView));
    const originalFetch = jest.mocked(globalThis.fetch).getMockImplementation()!;
    jest.mocked(globalThis.fetch).mockImplementation((url, init) => {
      if (String(url) === "/api/coaching/runway" && init?.method === "POST") {
        runwayFetch.mockResolvedValue(response({...coachView, upcomingBookings: [{...booking, scheduleNotification: {id: "notice", status: "PLANNED", errorCode: null}}]}));
        return Promise.resolve(response({ok: true, result: {nextAction: "Session time updated."}}) as Response);
      }
      return originalFetch(url, init);
    });
    render(<CoachingPage />);
    await screen.findByRole("heading", {name: booking.title, level: 3});
    fireEvent.click(screen.getByText("Change appointment"));
    const notify = screen.getByLabelText("Email client about the new time");
    expect(notify).toBeChecked();
    fireEvent.click(notify);
    expect(screen.getByRole("button", {name: "Save new time"})).toBeInTheDocument();
    fireEvent.click(notify);
    fireEvent.change(screen.getByLabelText("New date and time"), {target: {value: "2026-09-21T10:00"}});
    fireEvent.click(screen.getByRole("button", {name: "Save and notify client"}));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/coaching/runway", expect.objectContaining({method: "POST"})));
    const submission = jest.mocked(globalThis.fetch).mock.calls.find(([url, init]) => url === "/api/coaching/runway" && init?.method === "POST")!;
    expect(JSON.parse(submission[1]!.body as string)).toMatchObject({action: "reschedule-booking", bookingId: booking.id, notifyClient: true});
    expect(await screen.findByText("Client email update queued.")).toBeInTheDocument();
  });

  it("schedules from the selected client space with the edited time, not the default time", async () => {
    jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams("clientSpace=space-1") as never);
    const context = { engagementId: "space-1", title: "Riley coaching", projectSlug: "coach-home", coachUserId: "coach-1", clientEmail: user.email, clientName: user.name };
    const coachView = {...loaded, user: {...user, id: "coach-1", isCoach: true, isClient: false}, upcomingBookings: []};
    runwayFetch.mockResolvedValue(response(coachView));
    const originalFetch = jest.mocked(globalThis.fetch).getMockImplementation()!;
    jest.mocked(globalThis.fetch).mockImplementation((url, init) => {
      if (String(url).startsWith("/api/coaching/engagements?")) return Promise.resolve(response({context}) as Response);
      if (init?.method === "POST" && String(url) === "/api/coaching/runway") return Promise.resolve(response({ok: true, result: {nextAction: "Session created."}}) as Response);
      return originalFetch(url, init);
    });
    render(<CoachingPage />);
    const email = await screen.findByRole("textbox", {name: "Client email"});
    await waitFor(() => expect(email).toHaveValue(user.email));
    expect(email).toHaveAttribute("readonly");
    const scheduling = within(screen.getByRole("region", {name: "Schedule a Session"}));
    fireEvent.change(scheduling.getByLabelText("Start"), {target: {value: "2026-09-09T10:00"}});
    fireEvent.change(scheduling.getByLabelText("Session name"), {target: {value: "Writing follow-up"}});
    fireEvent.click(screen.getByRole("button", {name: "Schedule and send invite"}));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/coaching/runway", expect.objectContaining({method: "POST"})));
    const submission = jest.mocked(globalThis.fetch).mock.calls.find(([url, init]) => url === "/api/coaching/runway" && init?.method === "POST")!;
    expect(JSON.parse(submission[1]!.body as string)).toMatchObject({engagementId: "space-1", clientEmail: user.email, clientName: user.name, scheduledStart: "2026-09-09T10:00", title: "Writing follow-up"});
  });

  it("lets a client cancel their proposed time and reloads the remaining work", async () => {
    const hold = {id: "hold/client-1", status: "ACTIVE", isClientRequest: true,
      client: user, coach: booking.coach, offeringTitle: "Requested coaching time",
      scheduledStart: booking.scheduledStart, scheduledEnd: booking.scheduledEnd,
      timezone: booking.timezone};
    runwayFetch.mockResolvedValueOnce(response({...loaded, bookingHolds: [hold]}))
      .mockResolvedValue(response({...loaded, bookingHolds: []}));
    const originalFetch = jest.mocked(globalThis.fetch).getMockImplementation()!;
    jest.mocked(globalThis.fetch).mockImplementation((url, init) =>
      String(url).startsWith("/api/coaching/booking-requests?")
        ? Promise.resolve(response({ok: true}) as Response)
        : originalFetch(url, init));
    jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<CoachingPage />);
    fireEvent.click(await screen.findByRole("button", {name: "Cancel request"}));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/coaching/booking-requests?holdId=hold%2Fclient-1", {method: "DELETE"}));
    await waitFor(() => expect(screen.queryByRole("heading", {name: hold.offeringTitle})).not.toBeInTheDocument());
    expect(screen.getByRole("link", {name: "Open my session"})).toHaveAttribute("href", booking.liveSessionPath);
    expect(screen.queryByRole("button", {name: "Refresh operations"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Schedule and send invite"})).not.toBeInTheDocument();
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
