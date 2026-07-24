import {
  parseSessionWorkspaceMode,
  SESSION_WORKSPACE_MODES,
  sessionWorkspaceDefinition,
  sessionWorkspaceHref,
} from "./session-workspace-model";

describe("Session workspace modes", () => {
  it("accepts only the seven intentional modes and defaults safely", () => {
    expect(SESSION_WORKSPACE_MODES.map((mode) => mode.id)).toEqual([
      "overview",
      "prepare",
      "recordings",
      "transcript",
      "notes",
      "work",
      "outputs",
    ]);
    expect(parseSessionWorkspaceMode("prepare")).toBe("prepare");
    expect(parseSessionWorkspaceMode("notes")).toBe("notes");
    expect(parseSessionWorkspaceMode("work")).toBe("work");
    expect(parseSessionWorkspaceMode(["transcript", "outputs"])).toBe("transcript");
    expect(parseSessionWorkspaceMode("admin")).toBe("overview");
    expect(parseSessionWorkspaceMode(undefined)).toBe("overview");
  });

  it("builds one encoded canonical Session URL per mode", () => {
    expect(sessionWorkspaceHref("room / private", "recordings"))
      .toBe("/sessions/room%20%2F%20private?mode=recordings");
    expect(sessionWorkspaceDefinition("outputs")).toMatchObject({
      label: "Outputs",
      eyebrow: "Durable handoff",
    });
  });
});
