/** @jest-environment node */

import {
  authorizeGoogleCalendarPushWorker,
  enqueueGoogleCalendarReconciliationBackstop,
  processGoogleCalendarReconciliationWakes,
} from "./google-calendar-push-worker";
import { queueGoogleCalendarReconciliationWake } from "@/lib/server/google-calendar-push";
import { reconcileGoogleCalendarCollection } from "@/lib/server/google-calendar-reconciliation-service";

jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-reconciliation-service", () => ({
  reconcileGoogleCalendarCollection: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-push", () => ({
  enableGoogleCalendarLiveUpdates: jest.fn(),
  queueGoogleCalendarReconciliationWake: jest.fn(),
  GoogleCalendarPushError: class GoogleCalendarPushError extends Error {},
}));

describe("Google Calendar push worker authentication", () => {
  it("fails closed when its scheduler identity or audience is absent", async () => {
    await expect(
      authorizeGoogleCalendarPushWorker({
        authorization: null,
        environment: {},
      }),
    ).resolves.toBe("not-configured");
    await expect(
      authorizeGoogleCalendarPushWorker({
        authorization: "Bearer token",
        environment: {
          GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT:
            "scheduler@example.invalid",
          GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE: "not-a-url",
        },
      }),
    ).resolves.toBe("not-configured");
  });

  it("accepts only a verified Google OIDC token for the exact service account and audience", async () => {
    const email =
      "quipsly-calendar-push@high-ground-odyssey.iam.gserviceaccount.com";
    const audience = "https://studio-hm2odnvjga-uc.a.run.app";
    const environment = {
      GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT: email,
      GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE: audience,
    };
    const verifyIdToken = jest
      .fn()
      .mockResolvedValue({ email, emailVerified: true });
    await expect(
      authorizeGoogleCalendarPushWorker({
        authorization: "Bearer signed-id-token",
        environment,
        verifyIdToken,
      }),
    ).resolves.toBe("authorized");
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "signed-id-token",
      audience,
    });
    await expect(
      authorizeGoogleCalendarPushWorker({
        authorization: "Bearer signed-id-token",
        environment,
        verifyIdToken: jest.fn().mockResolvedValue({
          email: "other@example.test",
          emailVerified: true,
        }),
      }),
    ).resolves.toBe("unauthorized");
    await expect(
      authorizeGoogleCalendarPushWorker({
        authorization: null,
        environment,
        verifyIdToken,
      }),
    ).resolves.toBe("unauthorized");
  });
});

describe("Google Calendar reconciliation backstop", () => {
  it("queues a deduplicated wake for live collections whose cursor is older than one day", async () => {
    const now = new Date("2026-08-03T18:00:00.000Z");
    const transaction = {};
    const prisma = {
      calendarCollection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "collection-1",
            cursor: { updatedAt: new Date("2026-08-02T17:59:59.000Z") },
          },
        ]),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    jest.mocked(queueGoogleCalendarReconciliationWake).mockResolvedValue({
      wakeId: "wake-1",
      deduplicated: false,
    });

    await expect(
      enqueueGoogleCalendarReconciliationBackstop({ prisma, now }),
    ).resolves.toEqual([
      { collectionId: "collection-1", wakeId: "wake-1", deduplicated: false },
    ]);
    expect(prisma.calendarCollection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          liveUpdatesEnabled: true,
          OR: [
            { cursor: { is: null } },
            {
              cursor: {
                is: { updatedAt: { lt: new Date("2026-08-02T18:00:00.000Z") } },
              },
            },
          ],
        }),
      }),
    );
    expect(queueGoogleCalendarReconciliationWake).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        collectionId: "collection-1",
        reason: "periodic-cursor-backstop",
        now,
      }),
    );
  });

  it("runs one follow-up reconciliation when a notification arrives during processing", async () => {
    const now = new Date("2026-08-03T18:00:00.000Z");
    const queuedWake = {
      id: "wake-1",
      collectionId: "collection-1",
      status: "QUEUED",
      attemptCount: 0,
    };
    const claimedWake = {
      ...queuedWake,
      status: "PROCESSING",
      attemptCount: 1,
      claimedAt: now,
    };
    const transaction = {
      calendarReconciliationWake: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(queuedWake)
          .mockResolvedValueOnce(queuedWake)
          .mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            ...claimedWake,
            metadataJson: { requeueAfterProcessing: true },
          })
          .mockResolvedValueOnce({ ...claimedWake, metadataJson: {} }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(
              data.status === "PROCESSING"
                ? claimedWake
                : { ...claimedWake, ...data },
            ),
          ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation) => operation(transaction)),
      calendarCollection: {
        findUnique: jest.fn().mockResolvedValue({
          id: "collection-1",
          status: "ACTIVE",
          liveUpdatesEnabled: true,
          connection: {
            status: "VERIFIED",
            userId: "user-1",
            user: { primaryEmail: "owner@example.test" },
          },
        }),
      },
    };
    jest.mocked(reconcileGoogleCalendarCollection).mockResolvedValue({
      superseded: false,
      conflictCount: 0,
    } as never);

    const results = await processGoogleCalendarReconciliationWakes({
      prisma,
      requestUrl: "https://nest.quipsly.com/api/cron/google-calendar-push",
      now,
      limit: 3,
    });

    expect(results).toHaveLength(2);
    expect(reconcileGoogleCalendarCollection).toHaveBeenCalledTimes(2);
    const requeueCall =
      transaction.calendarReconciliationWake.update.mock.calls.find(
        ([argument]) => argument.data.status === "QUEUED",
      );
    expect(requeueCall?.[0].data).toEqual(
      expect.objectContaining({ status: "QUEUED", claimedAt: null }),
    );
    expect(requeueCall?.[0].data).not.toHaveProperty("activeKey");
    expect(
      transaction.calendarReconciliationWake.update,
    ).toHaveBeenLastCalledWith({
      where: { id: "wake-1" },
      data: expect.objectContaining({ activeKey: null, status: "SUCCEEDED" }),
    });
  });
});
