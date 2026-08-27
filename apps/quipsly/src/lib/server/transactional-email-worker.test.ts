/** @jest-environment node */

import {
  authorizeTransactionalEmailWorker,
  runTransactionalEmailMaintenance,
} from "./transactional-email-worker";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/google-oidc-worker-auth", () => ({
  authorizeGoogleOidcWorker: jest.fn(async (input) =>
    input.authorization === "Bearer valid" &&
    input.expectedEmail === "worker@example.iam.gserviceaccount.com" &&
    input.audience === "https://studio.example.run.app"
      ? "authorized"
      : "unauthorized"),
}));

const NOW = new Date("2026-08-27T18:00:00.000Z");

function harness(input?: { suppressedClient?: boolean; oldFingerprint?: string }) {
  const users = new Map([
    ["coach-1", { id: "coach-1", name: "Casey Coach", primaryEmail: "coach@example.com", isActive: true }],
    ["client-1", { id: "client-1", name: "Chris Client", primaryEmail: "client@example.com", isActive: true }],
  ]);
  const booking = {
    id: "booking-1",
    status: "CONFIRMED",
    scheduledStart: new Date("2026-08-29T18:00:00.000Z"),
    scheduledEnd: new Date("2026-08-29T19:00:00.000Z"),
    timezone: "America/Denver",
    createdAt: new Date("2026-08-27T17:00:00.000Z"),
    callRoom: { id: "room-1" },
    room: { id: "room-1", title: "Focused coaching" },
    clientUser: users.get("client-1"),
    coachUser: users.get("coach-1"),
  };
  const rows = new Map<string, any>();
  if (input?.oldFingerprint) {
    rows.set("old-email", {
      id: "old-email",
      idempotencyKey: "old-key",
      bookingId: booking.id,
      roomId: "room-1",
      recipientUserId: "client-1",
      recipientEmail: "client@example.com",
      recipientRole: "CLIENT",
      kind: "SESSION_REMINDER_24H",
      status: "PLANNED",
      scheduleFingerprint: input.oldFingerprint,
      scheduledFor: new Date("2026-08-28T18:00:00.000Z"),
      nextAttemptAt: new Date("2026-08-28T18:00:00.000Z"),
      attemptCount: 0,
      maxAttempts: 5,
      leaseToken: null,
      leaseExpiresAt: null,
    });
  }
  const apply = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === "object" && "increment" in value
        ? (row[key] || 0) + Number((value as any).increment)
        : value;
    }
    return row;
  };
  const models = {
    coachingBooking: {
      findMany: jest.fn(async () => [booking]),
    },
    transactionalEmail: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = where.idempotencyKey
          ? [...rows.values()].find((entry) => entry.idempotencyKey === where.idempotencyKey)
          : rows.get(where.id);
        if (!row) return null;
        return include
          ? {
              ...row,
              booking: {
                ...booking,
                callRoom: undefined,
              },
              room: booking.room,
              recipient: users.get(row.recipientUserId),
            }
          : row;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where.bookingId?.in) {
          return [...rows.values()].filter((row) =>
            where.bookingId.in.includes(row.bookingId));
        }
        return [...rows.values()]
          .filter((row) => ["PLANNED", "FAILED"].includes(row.status))
          .filter((row) => row.scheduledFor <= where.scheduledFor.lte)
          .filter((row) => row.nextAttemptAt <= where.nextAttemptAt.lte)
          .map((row) => ({ id: row.id }));
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `email-${rows.size + 1}`,
          status: "PLANNED",
          attemptCount: 0,
          maxAttempts: 5,
          leaseToken: null,
          leaseExpiresAt: null,
          ...data,
        };
        rows.set(row.id, row);
        return row;
      }),
      createMany: jest.fn(async ({ data }: any) => {
        let count = 0;
        for (const entry of data) {
          if ([...rows.values()].some((row) => row.idempotencyKey === entry.idempotencyKey)) {
            continue;
          }
          const row = {
            id: `email-${rows.size + 1}`,
            status: "PLANNED",
            attemptCount: 0,
            maxAttempts: 5,
            leaseToken: null,
            leaseExpiresAt: null,
            ...entry,
          };
          rows.set(row.id, row);
          count += 1;
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }: any) => apply(rows.get(where.id), data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matches = [...rows.values()].filter((row) => {
          if (typeof where.id === "string" && row.id !== where.id) return false;
          if (where.id?.in && !where.id.in.includes(row.id)) return false;
          if (where.bookingId && row.bookingId !== where.bookingId) return false;
          if (where.status?.in && !where.status.in.includes(row.status)) return false;
          if (typeof where.status === "string" && row.status !== where.status) return false;
          if (where.errorCode && row.errorCode !== where.errorCode) return false;
          if (where.scheduleFingerprint?.not && row.scheduleFingerprint === where.scheduleFingerprint.not) return false;
          if (where.leaseToken && row.leaseToken !== where.leaseToken) return false;
          if (where.leaseExpiresAt?.lt && !(row.leaseExpiresAt < where.leaseExpiresAt.lt)) return false;
          if (where.scheduledFor?.lte && row.scheduledFor > where.scheduledFor.lte) return false;
          if (where.nextAttemptAt?.lte && row.nextAttemptAt > where.nextAttemptAt.lte) return false;
          return true;
        });
        matches.forEach((row) => apply(row, data));
        return { count: matches.length };
      }),
    },
    emailRecipientDeliveryState: {
      findUnique: jest.fn(async ({ where }: any) =>
        input?.suppressedClient && where.recipientEmail === "client@example.com"
          ? { status: "SUPPRESSED" }
          : null),
    },
  };
  return { prisma: models, models, rows };
}

describe("transactional email worker", () => {
  it("authorizes only the configured OIDC scheduler identity", async () => {
    const environment = {
      QUIPSLY_TRANSACTIONAL_EMAIL_SERVICE_ACCOUNT: "worker@example.iam.gserviceaccount.com",
      QUIPSLY_TRANSACTIONAL_EMAIL_AUDIENCE: "https://studio.example.run.app",
    };
    await expect(authorizeTransactionalEmailWorker({
      authorization: "Bearer valid",
      environment,
    })).resolves.toBe("authorized");
    await expect(authorizeTransactionalEmailWorker({
      authorization: "Bearer wrong",
      environment,
    })).resolves.toBe("unauthorized");
  });

  it("plans each current message once and immediately sends due confirmations", async () => {
    const state = harness();
    const send = jest.fn(async (input: any) => ({
      ok: true as const,
      provider: "resend" as const,
      providerMessageId: `provider-${input.recipientEmail}`,
    }));
    const result = await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: send as never,
    });

    expect(result).toMatchObject({ planned: 6, candidates: 2, sent: 2, failed: 0 });
    expect(result.scanSaturated).toBe(false);
    expect(state.models.coachingBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 }),
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect([...state.rows.values()].filter((row) => row.status === "SENT")).toHaveLength(2);

    const second = await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: send as never,
    });
    expect(second.planned).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("suppresses a known bad mailbox without calling the provider for it", async () => {
    const state = harness({ suppressedClient: true });
    const send = jest.fn(async () => ({
      ok: true as const,
      provider: "resend" as const,
      providerMessageId: "provider-coach",
    }));
    const result = await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: send as never,
    });

    expect(result).toMatchObject({ sent: 1, suppressed: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("cancels unsent reminders from a superseded schedule", async () => {
    const state = harness({ oldFingerprint: "outdated-schedule" });
    const result = await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: jest.fn(async () => ({
        ok: true as const,
        provider: "resend" as const,
        providerMessageId: "provider-1",
      })) as never,
    });

    expect(result.canceledStale).toBe(1);
    expect(state.rows.get("old-email")).toMatchObject({
      status: "CANCELED",
      errorCode: "SESSION_RESCHEDULED",
    });
  });

  it("does not resurrect a terminally canceled message on the next reconciliation", async () => {
    const state = harness();
    const send = jest.fn(async () => ({
      ok: true as const,
      provider: "resend" as const,
      providerMessageId: "provider-1",
    }));
    await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: send as never,
    });
    const reminder = [...state.rows.values()].find((row) => row.status === "PLANNED");
    reminder.status = "CANCELED";
    reminder.errorCode = "INVALID_RECIPIENT";

    const second = await runTransactionalEmailMaintenance({
      prisma: state.prisma as never,
      now: NOW,
      send: send as never,
    });

    expect(second.reactivated).toBe(0);
    expect(reminder).toMatchObject({
      status: "CANCELED",
      errorCode: "INVALID_RECIPIENT",
    });
  });
});
