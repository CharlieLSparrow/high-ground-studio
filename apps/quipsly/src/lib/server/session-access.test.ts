/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  sessionAccessWhere,
  sessionActorAccessWhere,
  sessionMutationAccessWhere,
  sessionMutationActorAccessWhere,
  sessionInvitationAccessWhere,
} from "./session-access";

describe("canonical Session access", () => {
  it("includes active Nest collaborators in every Session projection", () => {
    expect(
      sessionActorAccessWhere({
        id: "editor-2",
        email: " Editor-2@Example.Test ",
      }),
    ).toEqual({
      OR: expect.arrayContaining([
        { createdByUserId: "editor-2" },
        { participants: { some: { userId: "editor-2" } } },
        {
          project: {
            accessGrants: {
              some: {
                email: "editor-2@example.test",
                status: "ACTIVE",
              },
            },
          },
        },
      ]),
    });
  });

  it("adds the exact room identity without changing the shared actor policy", () => {
    expect(
      sessionAccessWhere("room-1", {
        id: "editor-2",
        primaryEmail: "editor-2@example.test",
      }),
    ).toEqual(
      expect.objectContaining({
        id: "room-1",
        OR: expect.any(Array),
      }),
    );
  });

  it("requires an editor-or-owner project grant for Session mutations", () => {
    expect(
      sessionMutationActorAccessWhere({
        id: "editor-2",
        primaryEmail: " Editor-2@Example.Test ",
      }),
    ).toEqual({
      OR: expect.arrayContaining([
        {
          project: {
            accessGrants: {
              some: {
                email: "editor-2@example.test",
                status: "ACTIVE",
                role: { in: ["OWNER", "EDITOR"] },
              },
            },
          },
        },
        {
          participants: {
            some: {
              userId: "editor-2",
              role: { not: "OBSERVER" },
            },
          },
        },
      ]),
    });
  });

  it("keeps staff mutation access exact-room scoped", () => {
    expect(
      sessionMutationAccessWhere("room-1", {
        id: "staff-1",
        isStaff: true,
      }),
    ).toEqual({ id: "room-1" });
  });

  it("keeps staff access exact-room scoped", () => {
    expect(
      sessionAccessWhere("room-1", {
        id: "staff-1",
        isStaff: true,
      }),
    ).toEqual({ id: "room-1" });
  });

  it("lets hosts, coaches, and producers invite without letting ordinary guests expand the room", () => {
    const where = sessionInvitationAccessWhere("room-1", {
      id: "producer-1",
      primaryEmail: "producer@example.test",
    });
    expect(where).toEqual(expect.objectContaining({
      id: "room-1",
      OR: expect.arrayContaining([
        {
          participants: {
            some: {
              userId: "producer-1",
              role: { in: ["HOST", "COACH", "PRODUCER"] },
            },
          },
        },
      ]),
    }));
    expect(JSON.stringify(where)).not.toContain('"GUEST"');
    expect(JSON.stringify(where)).not.toContain('"CLIENT"');
  });
});
