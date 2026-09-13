import {act, renderHook} from "@testing-library/react";
import {useSessionMediaNavigation} from "./use-session-media-navigation";

describe("Session media navigation", () => {
  beforeEach(() => window.history.replaceState({test: "retained"}, "", "/sessions/room?mode=recordings&source=one&at=7#recording-share"));
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("keeps a source and its clock across recording, transcript and workspace links", () => {
    const {result} = renderHook(() => useSessionMediaNavigation("room", "one", 7));
    expect(result.current.href("transcript")).toBe("/sessions/room?mode=transcript&source=one&at=7");
    act(() => result.current.select("two", 12.3456));
    expect(result.current.href("recordings")).toBe("/sessions/room?mode=recordings&source=two&at=12.346");
    expect(result.current.href("notes")).toContain("source=two");
    expect(window.location.search).toBe("?mode=recordings&source=two&at=12.346");
    expect(window.location.hash).toBe("#recording-share");
    expect(window.history.state).toEqual({test: "retained"});
  });

  it("retains a selected participant within a take but resets the clock for a different take", () => {
    const {result} = renderHook(() => useSessionMediaNavigation("room", "one", 7));
    act(() => result.current.selectTake(["two", "one"]));
    expect(result.current.focus).toEqual({sourceId: "one", seconds: 7});
    act(() => result.current.selectTake(["new-coach", "new-client"]));
    expect(result.current.focus).toEqual({sourceId: "new-coach", seconds: null});
    expect(window.location.search).toBe("?mode=recordings&source=new-coach");
  });

  it("rejects callbacks from a previous navigation scope", () => {
    const {result, rerender} = renderHook(({room, source}) => useSessionMediaNavigation(room, source, null), {initialProps: {room: "room", source: "one"}});
    const stale = result.current.select;
    rerender({room: "different-room", source: "other"});
    act(() => stale("private-old-source", 9));
    expect(result.current.focus).toEqual({sourceId: "other", seconds: null});
    expect(result.current.href("transcript")).toBe("/sessions/different-room?mode=transcript&source=other");
  });

  it("does not rewrite a different page or add invalid time values", () => {
    window.history.replaceState(null, "", "/notes/a");
    const {result} = renderHook(() => useSessionMediaNavigation("room", null, null));
    act(() => result.current.select("one", Number.NaN));
    expect(result.current.href("transcript")).toBe("/sessions/room?mode=transcript&source=one");
    expect(window.location.pathname).toBe("/notes/a");
  });
});
