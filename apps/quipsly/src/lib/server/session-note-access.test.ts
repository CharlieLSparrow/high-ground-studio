import {
  canEditSessionNoteProjection,
  mobileSessionNoteVisibilityWhere,
  sessionNoteMutationWhere,
  sessionNoteVisibilityWhere,
} from "./session-note-access";

describe("Session note visibility policy", () => {
  it("keeps author-private notes author-only while allowing Session-safe audiences", () => {
    expect(sessionNoteVisibilityWhere({
      actorUserId: "participant-1",
      canViewProjectTeam: false,
    })).toEqual({
      OR: [
        { authorUserId: "participant-1" },
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
      ],
    });
  });

  it("adds project-team notes only for production-capable access", () => {
    expect(sessionNoteVisibilityWhere({
      actorUserId: "editor-1",
      canViewProjectTeam: true,
    })).toEqual({
      OR: [
        { authorUserId: "editor-1" },
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        { visibility: "PROJECT_TEAM" },
      ],
    });
  });

  it("requires an active owner or editor grant for project-team notes on iPhone", () => {
    expect(mobileSessionNoteVisibilityWhere({
      actorUserId: "editor-1",
      actorEmail: "editor@example.test",
      isStaff: false,
    })).toEqual({
      OR: [
        { authorUserId: "editor-1" },
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        {
          visibility: "PROJECT_TEAM",
          room: {
            project: {
              accessGrants: {
                some: {
                  email: "editor@example.test",
                  status: "ACTIVE",
                  role: { in: ["OWNER", "EDITOR"] },
                },
              },
            },
          },
        },
      ],
    });
  });

  it("does not let staff status widen another author's private notes", () => {
    expect(mobileSessionNoteVisibilityWhere({
      actorUserId: "staff-1",
      actorEmail: "staff@example.test",
      isStaff: true,
    })).toEqual({
      OR: [
        { authorUserId: "staff-1" },
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        { visibility: "PROJECT_TEAM" },
      ],
    });
  });

  it("lets writable Session participants mutate shared notes without widening private notes", () => {
    expect(sessionNoteMutationWhere({ id: "participant-1", primaryEmail: "person@example.test" })).toMatchObject({
      kind: { in: ["SESSION_NOTE", "DECISION", "PRODUCTION"] },
      OR: [
        { authorUserId: "participant-1" },
        { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
        expect.objectContaining({ visibility: "PROJECT_TEAM" }),
      ],
    });
    expect(canEditSessionNoteProjection({
      actorUserId: "participant-1",
      authorUserId: "participant-2",
      kind: "SESSION_NOTE",
      visibility: "SESSION_SHARED",
      canMutateSession: true,
      canUseProjectTeam: false,
    })).toBe(true);
    expect(canEditSessionNoteProjection({
      actorUserId: "participant-1",
      authorUserId: "participant-2",
      kind: "SESSION_NOTE",
      visibility: "AUTHOR_PRIVATE",
      canMutateSession: true,
      canUseProjectTeam: false,
    })).toBe(false);
    expect(canEditSessionNoteProjection({
      actorUserId: "observer-1",
      authorUserId: "participant-2",
      kind: "SESSION_NOTE",
      visibility: "SESSION_SHARED",
      canMutateSession: false,
      canUseProjectTeam: false,
    })).toBe(false);
  });
});
