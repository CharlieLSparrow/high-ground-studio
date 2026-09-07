import CallRoomPage from "./page";

const redirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (value: string) => redirect(value) }));

describe("canonical live Session entry", () => {
  beforeEach(() => redirect.mockClear());

  it.each([
    [undefined, "/coaching/sessions"],
    [{}, "/coaching/sessions"],
    [{ room: "call-room-1" }, "/sessions/call-room-1?mode=live"],
    [{ roomId: "current", room: "old" }, "/sessions/current?mode=live"],
    [{ room: ["first", "second"] }, "/sessions/first?mode=live"],
    [{ room: "../other?mode=admin" }, "/sessions/..%2Fother%3Fmode%3Dadmin?mode=live"],
  ])("opens the right workspace for %p without an explanatory detour", async (query, destination) => {
    await CallRoomPage({ searchParams: query ? Promise.resolve(query) : undefined });
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(destination);
  });
});
