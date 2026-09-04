import {
  PRODUCTION_CORE_FEATURE_GROUPS,
  REQUIRED_PRODUCTION_CORE_TABLES,
  migrationReadinessFromNames,
  readinessFromTables,
} from "./production-core-readiness";

describe("production core readiness", () => {
  it("requires canonical goals, task links, progress evidence, and personal focus blocks", () => {
    expect(REQUIRED_PRODUCTION_CORE_TABLES).toEqual(expect.arrayContaining(["Goal", "GoalTaskLink", "GoalProgressReceipt", "WorkPlanBlock", "ActionItemTagLink", "GoalTagLink", "CallRoomTagLink", "TranscriptCorrection", "TranscriptCorrectionRevision"]));
    expect(PRODUCTION_CORE_FEATURE_GROUPS).toContainEqual(expect.objectContaining({
      id: "goals-follow-through",
      tables: ["Goal", "GoalTaskLink", "GoalProgressReceipt", "WorkPlanBlock"],
    }));
    expect(PRODUCTION_CORE_FEATURE_GROUPS).toContainEqual(expect.objectContaining({
      id: "transcript-evidence",
      tables: ["TranscriptCorrection", "TranscriptCorrectionRevision"],
    }));
    expect(PRODUCTION_CORE_FEATURE_GROUPS).toContainEqual(expect.objectContaining({
      id: "work-session-taxonomy",
      tables: ["StudioDocumentTagLink", "ActionItemTagLink", "CoachingNoteTagLink", "GoalTagLink", "CallRoomTagLink"],
    }));
  });

  it("keeps readiness blocked when every Goal-prefixed table is missing", () => {
    const existing = new Set(REQUIRED_PRODUCTION_CORE_TABLES.filter((table) => !table.startsWith("Goal")));
    const result = readinessFromTables(existing, "2026-07-18T20:00:00.000Z");
    expect(result).toMatchObject({
      ok: false,
      status: "needs-schema-sync",
      missingTables: ["Goal", "GoalTaskLink", "GoalProgressReceipt", "GoalTagLink"],
    });
    expect(result.groups.find((group) => group.id === "goals-follow-through")).toMatchObject({
      status: "needs-schema-sync",
      missingTables: ["Goal", "GoalTaskLink", "GoalProgressReceipt"],
    });
    expect(result.groups.find((group) => group.id === "work-session-taxonomy")).toMatchObject({
      status: "needs-schema-sync",
      missingTables: ["GoalTagLink"],
    });
  });

  it("blocks an exact app image when any shipped migration is absent", () => {
    expect(migrationReadinessFromNames(
      [
        "20260827223000_add_personal_note_sessions",
        "20260829100000_add_voice_recognition_preferences",
      ],
      ["20260827223000_add_personal_note_sessions"],
    )).toEqual({
      ok: false,
      expectedMigrationCount: 2,
      appliedMigrationCount: 1,
      missingMigrations: ["20260829100000_add_voice_recognition_preferences"],
    });
  });

  it("allows a compatible older image when all migrations it ships are applied", () => {
    expect(migrationReadinessFromNames(
      ["20260827223000_add_personal_note_sessions"],
      [
        "20260827223000_add_personal_note_sessions",
        "20260829100000_add_voice_recognition_preferences",
      ],
    )).toMatchObject({
      ok: true,
      expectedMigrationCount: 1,
      appliedMigrationCount: 1,
      missingMigrations: [],
    });
  });
});
