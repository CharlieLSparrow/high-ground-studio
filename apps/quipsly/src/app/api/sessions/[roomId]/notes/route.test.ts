/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const roomId = "room-1";
const actor = {
  id: "editor-2",
  primaryEmail: " Editor-2@Example.Test ",
  isStaff: false,
};

function request() {
  return new Request(`http://localhost/api/sessions/${roomId}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientRequestId: "18c70a70-521a-4d3f-9ec0-657ee72337d4",
      title: "Transaction access test",
      body: "Do not create this note after authority changes.",
      kind: "SESSION_NOTE",
      visibility: "SESSION_SHARED",
    }),
  });
}

function mutationGrantWhere() {
  return expect.objectContaining({
    id: roomId,
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
    ]),
  });
}

describe("Session note mutation access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as any);
  });

  it("rechecks editor authority inside the transaction and writes nothing after revocation", async () => {
    const callRoomFindFirst = jest.fn()
      .mockResolvedValueOnce({
        id: roomId,
        bookingId: null,
        project: { accessGrants: [{ role: "EDITOR" }] },
      })
      .mockResolvedValueOnce(null);
    const prisma: any = {
      callRoom: { findFirst: callRoomFindFirst },
      coachingNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(request(), { params: Promise.resolve({ roomId }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(callRoomFindFirst).toHaveBeenCalledTimes(2);
    for (const [input] of callRoomFindFirst.mock.calls) {
      expect(input.where).toEqual(mutationGrantWhere());
    }
    expect(prisma.coachingNote.create).not.toHaveBeenCalled();
  });
});
