/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { buildCoachingPacketFromTranscriptJob } from "@/lib/server/coaching-packets";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { PATCH, POST } from "./route-implementation";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/coaching-packets", () => {
  const actual = jest.requireActual("@/lib/server/coaching-packets");
  return {
    ...actual,
    buildCoachingPacketFromTranscriptJob: jest.fn(),
  };
});

const actor = {
  id: "producer-2",
  primaryEmail: " Producer-2@Example.Test ",
  isStaff: false,
};
const roomId = "room-1";
const transcriptJobId = "transcript-1";
const summaryNoteId = "summary-1";

function activeGrantWhere() {
  return expect.objectContaining({
    OR: expect.arrayContaining([
      {
        project: {
          accessGrants: {
            some: {
              email: "producer-2@example.test",
              status: "ACTIVE",
              role: { in: ["OWNER", "EDITOR"] },
            },
          },
        },
      },
    ]),
  });
}

function packetBuildRequest() {
  return new Request("http://localhost/api/mobile/capture/transcripts/packet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcriptJobId }),
  });
}

describe("packet mutation Session access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue({ user: actor } as any);
    jest
      .mocked(acquirePrismaAdvisoryTransactionLock)
      .mockResolvedValue(undefined as never);
  });

  it("uses the canonical active Nest grant before and inside packet build", async () => {
    const transcriptJobFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: transcriptJobId })
      .mockResolvedValueOnce({ id: transcriptJobId });
    const prisma: any = {
      transcriptJob: { findFirst: transcriptJobFindFirst },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) =>
      callback(prisma),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma);
    jest.mocked(buildCoachingPacketFromTranscriptJob).mockResolvedValue({
      ok: true,
      reusedExistingPacket: false,
    } as any);

    const response = await POST(packetBuildRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.boundaries).toMatchObject({
      canonicalSessionAccess: true,
      sessionAccessRecheckedOnMutation: true,
    });
    expect(transcriptJobFindFirst).toHaveBeenCalledTimes(2);
    for (const [input] of transcriptJobFindFirst.mock.calls) {
      expect(input.where).toEqual(
        expect.objectContaining({
          id: transcriptJobId,
          room: activeGrantWhere(),
        }),
      );
    }
    expect(buildCoachingPacketFromTranscriptJob).toHaveBeenCalledTimes(1);
  });

  it("does not build a packet when the active Nest grant is revoked before the transaction", async () => {
    const transcriptJobFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: transcriptJobId })
      .mockResolvedValueOnce(null);
    const prisma: any = {
      transcriptJob: { findFirst: transcriptJobFindFirst },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) =>
      callback(prisma),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(packetBuildRequest());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe("SESSION_ACCESS_REVOKED");
    expect(buildCoachingPacketFromTranscriptJob).not.toHaveBeenCalled();
  });

  it("does not write lane review state when Session access is revoked before commit", async () => {
    const summary = {
      id: summaryNoteId,
      kind: "SUMMARY",
      roomId,
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId,
        reviewLanes: [{ id: "commitments", status: "READY_FOR_HUMAN_REVIEW" }],
      },
      updatedAt: new Date("2026-08-01T18:00:00.000Z"),
    };
    const callRoomFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: roomId })
      .mockResolvedValueOnce(null);
    const prisma: any = {
      callRoom: { findFirst: callRoomFindFirst },
      coachingNote: {
        findMany: jest.fn().mockResolvedValue([summary]),
        update: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) =>
      callback(prisma),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await PATCH(
      new Request("http://localhost/api/mobile/capture/transcripts/packet", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          transcriptJobId,
          summaryNoteId,
          laneId: "commitments",
          status: "APPROVED_FOR_INTERNAL_USE",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe("SESSION_ACCESS_REVOKED");
    expect(callRoomFindFirst).toHaveBeenCalledTimes(2);
    for (const [input] of callRoomFindFirst.mock.calls) {
      expect(input.where.id).toBe(roomId);
      expect(input.where).toEqual(activeGrantWhere());
    }
    expect(prisma.coachingNote.update).not.toHaveBeenCalled();
  });
});
