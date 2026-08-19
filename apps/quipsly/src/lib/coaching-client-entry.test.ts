import { coachingClientEntryPaths } from "./coaching-client-entry";

describe("coachingClientEntryPaths", () => {
  it("prefers the exact live Session while preserving engagement continuity", () => {
    expect(coachingClientEntryPaths({
      roomId: "room/one",
      engagementId: "engagement one",
    })).toEqual({
      clientEntryPath: "/sessions/room%2Fone?mode=live",
      engagementPath: "/coaching/engagements/engagement%20one",
      liveSessionPath: "/sessions/room%2Fone?mode=live",
      sessionWorkspacePath: "/sessions/room%2Fone",
    });
  });

  it("falls back to the durable engagement when no Session exists", () => {
    expect(coachingClientEntryPaths({ engagementId: "engagement-1" })).toEqual({
      clientEntryPath: "/coaching/engagements/engagement-1",
      engagementPath: "/coaching/engagements/engagement-1",
      liveSessionPath: null,
      sessionWorkspacePath: null,
    });
  });

  it("never fabricates an entry path without canonical identities", () => {
    expect(coachingClientEntryPaths({ roomId: " ", engagementId: null })).toEqual({
      clientEntryPath: null,
      engagementPath: null,
      liveSessionPath: null,
      sessionWorkspacePath: null,
    });
  });
});
