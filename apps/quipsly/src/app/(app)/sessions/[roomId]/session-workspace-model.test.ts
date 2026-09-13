import {
  parseSessionWorkspaceMode,
  SESSION_WORKSPACE_MODES,
  sessionWorkspaceDefinition,
  sessionWorkspaceDefinitionForPurpose,
  sessionWorkspaceHref,
  sessionWorkspaceModesForPurpose,
} from "./session-workspace-model";

describe("Session workspace modes", () => {
  it("accepts only the nine intentional modes and defaults safely", () => {
    expect(SESSION_WORKSPACE_MODES.map((mode) => mode.id)).toEqual([
      "overview",
      "prepare",
      "live",
      "conversation",
      "recordings",
      "transcript",
      "notes",
      "work",
      "outputs",
    ]);
    expect(parseSessionWorkspaceMode("prepare")).toBe("prepare");
    expect(parseSessionWorkspaceMode("live")).toBe("live");
    expect(parseSessionWorkspaceMode("conversation")).toBe("conversation");
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
  it("preserves an exact recording and bounded playback time without treating the ID as access", () => {
    expect(sessionWorkspaceHref("room", "transcript", {sourceId: "source&at=999", seconds: 8.125}))
      .toBe("/sessions/room?mode=transcript&source=source%26at%3D999&at=8.125");
    expect(sessionWorkspaceHref("room", "recordings", {sourceId: null, seconds: 8}))
      .toBe("/sessions/room?mode=recordings");
    expect(sessionWorkspaceHref("room", "transcript", {sourceId: "source", seconds: -1}))
      .toBe("/sessions/room?mode=transcript&source=source");
  });
});

describe("purpose-aware Session workspace language", () => {
  it.each([
    ["COACHING", "Coaching room", "Conversation", "Goals & commitments", "Follow-up"],
    ["PODCAST", "Recording room", "Take conversation", "Episode work", "Editor & publish"],
    ["RESEARCH_INTERVIEW", "Interview room", "Conversation", "Findings & tasks", "Writing uses"],
    ["INTERNAL_MEETING", "Team room", "Conversation", "Decisions & tasks", "Handoffs"],
    ["PERSONAL_NOTE", "Record", "Comments", "Ideas & tasks", "Share & export"],
  ])("projects %s without changing the canonical mode identities", (purpose, live, conversation, work, outputs) => {
    const definitions = sessionWorkspaceModesForPurpose(purpose);
    expect(definitions).toHaveLength(9);
    expect(definitions.map((definition) => definition.id)).toEqual([
      "overview",
      "prepare",
      "live",
      "conversation",
      "recordings",
      "transcript",
      "notes",
      "work",
      "outputs",
    ]);
    expect(sessionWorkspaceDefinitionForPurpose("live", purpose).label).toBe(live);
    expect(sessionWorkspaceDefinitionForPurpose("conversation", purpose).label).toBe(conversation);
    expect(sessionWorkspaceDefinitionForPurpose("work", purpose).label).toBe(work);
    expect(sessionWorkspaceDefinitionForPurpose("outputs", purpose).label).toBe(outputs);
  });
});
