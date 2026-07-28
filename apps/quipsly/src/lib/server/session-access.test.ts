/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  sessionAccessWhere,
  sessionActorAccessWhere,
} from "./session-access";

describe("canonical Session access", () => {
  it("includes active Nest collaborators in every Session projection", () => {
    expect(sessionActorAccessWhere({
      id: "editor-2",
      email: " Editor-2@Example.Test ",
    })).toEqual({
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
    expect(sessionAccessWhere("room-1", {
      id: "editor-2",
      primaryEmail: "editor-2@example.test",
    })).toEqual(expect.objectContaining({
      id: "room-1",
      OR: expect.any(Array),
    }));
  });

  it("keeps staff access exact-room scoped", () => {
    expect(sessionAccessWhere("room-1", {
      id: "staff-1",
      isStaff: true,
    })).toEqual({ id: "room-1" });
  });
});
