import {
  parseSessionWorkspaceMode,
  SESSION_WORKSPACE_MODES,
  sessionWorkspaceDefinition,
  sessionWorkspaceDefinitionForPurpose,
  sessionWorkspaceHref,
  sessionWorkspaceModesForPurpose,
} from "./session-workspace-model";

describe("Session workspace modes", () => {
  it("accepts only the eight intentional modes and defaults safely", () => {
    expect(SESSION_WORKSPACE_MODES.map((mode) => mode.id)).toEqual([
      "overview",
      "prepare",
      "live",
      "recordings",
      "transcript",
      "notes",
      "work",
      "outputs",
    ]);
    expect(parseSessionWorkspaceMode("prepare")).toBe("prepare");
    expect(parseSessionWorkspaceMode("live")).toBe("live");
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
      eyebrow: "Share and continue",
    });
  });
});

describe("purpose-aware Session workspace language", () => {
  it.each([
    ["COACHING", "Coaching room", "Goals & commitments", "Follow-up"],
    ["PODCAST", "Recording room", "Episode work", "Editor & publish"],
    ["RESEARCH_INTERVIEW", "Interview room", "Findings & tasks", "Writing uses"],
    ["INTERNAL_MEETING", "Team room", "Decisions & tasks", "Handoffs"],
  ])("projects %s without changing the canonical mode identities", (purpose, live, work, outputs) => {
    const definitions = sessionWorkspaceModesForPurpose(purpose);
    expect(definitions).toHaveLength(8);
    expect(definitions.map((definition) => definition.id)).toEqual([
      "overview",
      "prepare",
      "live",
      "recordings",
      "transcript",
      "notes",
      "work",
      "outputs",
    ]);
    expect(sessionWorkspaceDefinitionForPurpose("live", purpose).label).toBe(live);
    expect(sessionWorkspaceDefinitionForPurpose("work", purpose).label).toBe(work);
    expect(sessionWorkspaceDefinitionForPurpose("outputs", purpose).label).toBe(outputs);
  });
});
