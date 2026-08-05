/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-proxy-reconciliation", () => ({
  reconcileCaptureProxyResults: jest.fn(),
}));

import { recordingSessionsFor } from "./episode-room-store";

const actor = {
  userId: "editor-2",
  email: "editor-2@example.test",
  label: "Second editor",
  isStaff: false,
};

function recordingRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "call-room-1",
    title: "Episode 4 Part 2",
    purpose: "PODCAST",
    status: "RECORDING",
    provider: "livekit",
    recordingStartedAt: new Date("2026-07-27T19:00:00.000Z"),
    endedAt: null,
    updatedAt: new Date("2026-07-27T19:01:00.000Z"),
    participants: [{ role: "GUEST" }],
    ...overrides,
  };
}

describe("Episode Room recording-session projection", () => {
  it("keeps a directly accessible recording room openable", async () => {
    const findFirst = jest.fn();
    const findMany = jest.fn().mockResolvedValue([recordingRoom()]);
    const prisma = {
      callRoom: {
        findMany,
        findFirst,
      },
    };

    await expect(recordingSessionsFor(
      prisma,
      "project-1",
      "production-1",
      "episode-4-part-2",
      actor,
      "call-room-1",
    )).resolves.toEqual([
      expect.objectContaining({
        id: "call-room-1",
        participantRole: "GUEST",
        canUseRecordingClock: true,
        canOpenSession: true,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { episodeProductionId: "production-1" },
              expect.objectContaining({ episodeProductionId: null }),
            ]),
          }),
          expect.objectContaining({
            OR: expect.arrayContaining([
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
          }),
        ]),
      }),
    }));
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("shares only the bound clock summary with a Nest editor outside the raw Capture room", async () => {
    const findFirst = jest.fn().mockResolvedValue(
      recordingRoom({ participants: undefined }),
    );
    const prisma = {
      callRoom: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst,
      },
    };

    await expect(recordingSessionsFor(
      prisma,
      "project-1",
      "production-1",
      "episode-4-part-2",
      actor,
      "call-room-1",
    )).resolves.toEqual([
      expect.objectContaining({
        id: "call-room-1",
        participantRole: null,
        canUseRecordingClock: true,
        canOpenSession: false,
      }),
    ]);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "call-room-1",
        projectId: "project-1",
        purpose: "PODCAST",
        OR: [
          { episodeProductionId: "production-1" },
          {
            episodeProductionId: null,
            metadataJson: {
              path: ["episodeSlug"],
              equals: "episode-4-part-2",
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        purpose: true,
        status: true,
        provider: true,
        captureGroupId: true,
        recordingStartedAt: true,
        endedAt: true,
        updatedAt: true,
      },
    });
  });

  it("does not advertise a stopped bound room as a usable recording clock", async () => {
    const prisma = {
      callRoom: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(recordingRoom({
          status: "OPEN",
          participants: undefined,
        })),
      },
    };

    await expect(recordingSessionsFor(
      prisma,
      "project-1",
      "production-1",
      "episode-4-part-2",
      actor,
      "call-room-1",
    )).resolves.toEqual([
      expect.objectContaining({
        id: "call-room-1",
        status: "OPEN",
        canUseRecordingClock: false,
        canOpenSession: false,
      }),
    ]);
  });
});
