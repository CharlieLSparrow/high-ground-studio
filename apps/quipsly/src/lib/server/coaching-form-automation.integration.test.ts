/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { randomUUID } from "node:crypto";
import { QUIPSLY_COACHING_STARTER_FORMS } from "@high-ground/quipsly-domain/coaching-forms";

import { getPrismaClient } from "@/lib/prisma";
import {
  readCoachingFormAutomationOverview,
  reconcileCoachingFormAutomation,
  saveCoachingFormAutomationOverride,
  saveCoachingFormAutomationPolicy,
} from "./coaching-form-automation";
import { publishCoachingFormTemplate } from "./coaching-form-workflows";

const runDatabaseSmoke =
  process.env.QUIPSLY_COACHING_FORM_AUTOMATION_DB_SMOKE === "1"
    ? describe
    : describe.skip;

if (process.env.QUIPSLY_COACHING_FORM_AUTOMATION_DB_SMOKE === "1") {
  const configuredDatabaseUrl =
    process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!configuredDatabaseUrl) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for coaching form automation smoke.",
    );
  }
  const databaseUrl = new URL(configuredDatabaseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)) {
    throw new Error("Coaching form automation smoke refuses non-loopback PostgreSQL.");
  }
  process.env.DATABASE_URL = databaseUrl.toString();
}

runDatabaseSmoke("coaching form automation local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const now = new Date("2026-08-26T18:00:00.000Z");
  let coachUserId = "";
  let clientUserId = "";
  let outsiderUserId = "";
  let workspaceId = "";
  let projectId = "";
  let engagementId = "";
  let eligibleBookingId = "";
  let futureBookingId = "";
  let completedBookingId = "";
  let templateId = "";
  let engagementDeleted = false;

  beforeAll(async () => {
    const [coach, client, outsider] = await Promise.all([
      prisma.user.create({
        data: {
          primaryEmail: `automation-coach-${nonce}@example.test`,
          name: "Automation Coach",
        },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `automation-client-${nonce}@example.test`,
          name: "Automation Client",
        },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `automation-outsider-${nonce}@example.test`,
          name: "Neighboring Coach",
        },
      }),
    ]);
    coachUserId = coach.id;
    clientUserId = client.id;
    outsiderUserId = outsider.id;
    await Promise.all([
      prisma.coachProfile.create({ data: { userId: coachUserId } }),
      prisma.coachProfile.create({ data: { userId: outsiderUserId } }),
    ]);
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `automation-${nonce}`,
        name: "Automation boundary smoke",
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `automation-${nonce}`,
        name: "Automation boundary smoke",
      },
    });
    projectId = project.id;
    const engagement = await prisma.coachingEngagement.create({
      data: {
        projectId,
        createdByUserId: coachUserId,
        primaryCoachUserId: coachUserId,
        primaryClientUserId: clientUserId,
        title: "Automation Coach and Client",
        members: {
          create: [
            {
              userId: coachUserId,
              role: "COACH",
              status: "ACTIVE",
              addedByUserId: coachUserId,
            },
            {
              userId: clientUserId,
              role: "CLIENT",
              status: "ACTIVE",
              addedByUserId: coachUserId,
            },
          ],
        },
      },
    });
    engagementId = engagement.id;
    const bookings = await Promise.all([
      createBooking({
        prisma,
        engagementId,
        coachUserId,
        clientUserId,
        start: new Date("2026-08-27T06:00:00.000Z"),
        status: "CONFIRMED",
      }),
      createBooking({
        prisma,
        engagementId,
        coachUserId,
        clientUserId,
        start: new Date("2026-08-29T18:00:00.000Z"),
        status: "CONFIRMED",
      }),
      createBooking({
        prisma,
        engagementId,
        coachUserId,
        clientUserId,
        start: new Date("2026-08-25T17:00:00.000Z"),
        status: "COMPLETED",
        endedAt: new Date("2026-08-25T18:03:00.000Z"),
      }),
    ]);
    [eligibleBookingId, futureBookingId, completedBookingId] = bookings.map(
      (booking) => booking.id,
    );
    const published = await publishCoachingFormTemplate({
      prisma,
      actor: { id: coachUserId },
      body: {
        requestId: randomUUID(),
        definition: {
          ...QUIPSLY_COACHING_STARTER_FORMS[1],
          key: `automation-pre-${nonce}`,
          title: "Session compass",
        },
      },
    });
    templateId = published.template.id;
  });

  afterAll(async () => {
    try {
      if (engagementId && !engagementDeleted) {
        const policyIds = (
          await prisma.coachingFormAutomationPolicy.findMany({
            where: { engagementId },
            select: { id: true },
          })
        ).map((policy) => policy.id);
        if (policyIds.length) {
          await prisma.coachingFormAutomationReceipt.deleteMany({
            where: { policyId: { in: policyIds } },
          });
          await prisma.coachingFormAutomationOverride.deleteMany({
            where: { policyId: { in: policyIds } },
          });
          await prisma.coachingFormAutomationPolicy.deleteMany({
            where: { id: { in: policyIds } },
          });
        }
        await prisma.coachingFormAssignment.deleteMany({
          where: { engagementId },
        });
        await prisma.coachingEngagement.deleteMany({
          where: { id: engagementId },
        });
      }
      if (templateId) {
        await prisma.coachingFormTemplate.deleteMany({
          where: { id: templateId },
        });
      }
      await prisma.coachProfile.deleteMany({
        where: { userId: { in: [coachUserId, outsiderUserId].filter(Boolean) } },
      });
      if (projectId) {
        await prisma.studioProject.deleteMany({ where: { id: projectId } });
      }
      if (workspaceId) {
        await prisma.studioWorkspace.deleteMany({
          where: { id: workspaceId },
        });
      }
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [coachUserId, clientUserId, outsiderUserId].filter(Boolean),
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("assigns eligible events exactly once, keeps future timing visible, and denies a neighboring coach", async () => {
    const requestId = randomUUID();
    const saved = await saveCoachingFormAutomationPolicy({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId,
        templateId,
        engagementId,
        trigger: "BEFORE_SESSION",
        status: "ACTIVE",
        versionMode: "LATEST_PUBLISHED",
        releaseOffsetMinutes: -1_440,
        dueOffsetMinutes: 0,
      },
    });
    expect(saved.reconciliation).toMatchObject({
      examined: 3,
      created: 1,
      waitingForTime: 1,
      waitingForEvent: 1,
    });
    expect(saved.policy.trigger).toBe("BEFORE_SESSION");
    expect(saved.policy.receipts).toHaveLength(1);
    expect(saved.policy.receipts[0]).toMatchObject({
      templateRevision: 1,
      manualOverride: false,
    });
    expect(saved.policy.receipts[0].booking.id).toBe(eligibleBookingId);

    const replay = await saveCoachingFormAutomationPolicy({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId,
        templateId,
        engagementId,
        trigger: "BEFORE_SESSION",
        status: "ACTIVE",
        versionMode: "LATEST_PUBLISHED",
        releaseOffsetMinutes: -1_440,
        dueOffsetMinutes: 0,
      },
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.reconciliation).toMatchObject({ alreadyAssigned: 1 });

    await Promise.all([
      reconcileCoachingFormAutomation({
        prisma,
        policyIds: [saved.policy.id],
        now,
      }),
      reconcileCoachingFormAutomation({
        prisma,
        policyIds: [saved.policy.id],
        now,
      }),
    ]);
    expect(
      await prisma.coachingFormAutomationReceipt.count({
        where: { policyId: saved.policy.id, bookingId: eligibleBookingId },
      }),
    ).toBe(1);

    await expect(
      saveCoachingFormAutomationPolicy({
        prisma,
        actor: { id: outsiderUserId },
        now,
        body: {
          requestId: randomUUID(),
          templateId,
          engagementId,
          trigger: "BEFORE_SESSION",
          status: "ACTIVE",
          versionMode: "LATEST_PUBLISHED",
          releaseOffsetMinutes: -1_440,
          dueOffsetMinutes: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "COACHING_FORM_UNAVAILABLE",
    });
  });

  it("uses a new immutable version only for future events and records send-now, skip, clear, pause, and after-session receipts", async () => {
    const beforePolicy = await prisma.coachingFormAutomationPolicy.findFirstOrThrow({
      where: { templateId, engagementId, trigger: "BEFORE_SESSION" },
    });
    await publishCoachingFormTemplate({
      prisma,
      actor: { id: coachUserId },
      body: {
        requestId: randomUUID(),
        templateId,
        definition: {
          ...QUIPSLY_COACHING_STARTER_FORMS[1],
          key: `automation-pre-${nonce}`,
          title: "Session compass refined",
        },
      },
    });
    const sendNow = await saveCoachingFormAutomationOverride({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        policyId: beforePolicy.id,
        bookingId: futureBookingId,
        overrideAction: "SEND_NOW",
      },
    });
    expect(sendNow.reconciliation.created).toBe(1);
    const versions = await prisma.coachingFormAutomationReceipt.findMany({
      where: { policyId: beforePolicy.id },
      orderBy: { createdAt: "asc" },
      include: { templateVersion: true },
    });
    expect(versions.map((receipt) => receipt.templateVersion.revision)).toEqual([
      1, 2,
    ]);
    expect(versions[1].manualOverride).toBe(true);

    const skippedBooking = await createBooking({
      prisma,
      engagementId,
      coachUserId,
      clientUserId,
      start: new Date("2026-08-27T08:00:00.000Z"),
      status: "CONFIRMED",
    });
    await saveCoachingFormAutomationOverride({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        policyId: beforePolicy.id,
        bookingId: skippedBooking.id,
        overrideAction: "SKIP",
      },
    });
    expect(
      await prisma.coachingFormAutomationReceipt.count({
        where: { policyId: beforePolicy.id, bookingId: skippedBooking.id },
      }),
    ).toBe(0);
    await saveCoachingFormAutomationOverride({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        policyId: beforePolicy.id,
        bookingId: skippedBooking.id,
        overrideAction: "CLEAR",
      },
    });
    expect(
      await prisma.coachingFormAutomationReceipt.count({
        where: { policyId: beforePolicy.id, bookingId: skippedBooking.id },
      }),
    ).toBe(1);

    const paused = await saveCoachingFormAutomationPolicy({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        policyId: beforePolicy.id,
        templateId,
        engagementId,
        trigger: "BEFORE_SESSION",
        status: "PAUSED",
        versionMode: "LATEST_PUBLISHED",
        releaseOffsetMinutes: -1_440,
        dueOffsetMinutes: 0,
      },
    });
    expect(paused.policy.status).toBe("PAUSED");
    expect(paused.policy.revision).toBe(2);

    const pausedManualBooking = await createBooking({
      prisma,
      engagementId,
      coachUserId,
      clientUserId,
      start: new Date("2026-09-04T18:00:00.000Z"),
      status: "CONFIRMED",
    });
    const pausedManualSend = await saveCoachingFormAutomationOverride({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        policyId: beforePolicy.id,
        bookingId: pausedManualBooking.id,
        overrideAction: "SEND_NOW",
      },
    });
    expect(pausedManualSend.reconciliation.created).toBe(1);
    expect(
      await prisma.coachingFormAutomationReceipt.findFirst({
        where: {
          policyId: beforePolicy.id,
          bookingId: pausedManualBooking.id,
        },
        select: { manualOverride: true },
      }),
    ).toEqual({ manualOverride: true });

    const after = await saveCoachingFormAutomationPolicy({
      prisma,
      actor: { id: coachUserId },
      now,
      body: {
        requestId: randomUUID(),
        templateId,
        engagementId,
        trigger: "AFTER_SESSION",
        status: "ACTIVE",
        versionMode: "PINNED_VERSION",
        releaseOffsetMinutes: 0,
        dueOffsetMinutes: 2_880,
      },
    });
    expect(after.reconciliation.created).toBe(1);
    expect(after.policy.versionMode).toBe("PINNED_VERSION");
    expect(after.policy.receipts).toHaveLength(1);
    expect(after.policy.receipts[0]).toMatchObject({
      templateRevision: 2,
    });
    expect(after.policy.receipts[0].booking.id).toBe(completedBookingId);

    const overview = await readCoachingFormAutomationOverview({
      prisma,
      actor: { id: coachUserId },
    });
    expect(overview.policies).toHaveLength(2);
    expect(overview.boundaries).toMatchObject({
      relationshipScoped: true,
      exactlyOncePerPolicyEvent: true,
      appendOnlyOverrides: true,
      externalSideEffects: false,
    });
    const beforeOverview = overview.policies.find(
      (policy: { trigger: string }) => policy.trigger === "BEFORE_SESSION",
    );
    const afterOverview = overview.policies.find(
      (policy: { trigger: string }) => policy.trigger === "AFTER_SESSION",
    );
    expect(
      beforeOverview?.sessions.find(
        (session: { id: string }) => session.id === skippedBooking.id,
      )?.override,
    ).toMatchObject({ action: "CLEAR", revision: 2 });
    expect(
      afterOverview?.sessions.find(
        (session: { id: string }) => session.id === skippedBooking.id,
      )?.override,
    ).toBeNull();
  });

  it("removes private automation evidence with its coaching relationship instead of blocking deletion", async () => {
    expect(
      await prisma.coachingFormAutomationReceipt.count({
        where: { policy: { engagementId } },
      }),
    ).toBeGreaterThan(0);

    await expect(
      prisma.coachingEngagement.delete({ where: { id: engagementId } }),
    ).resolves.toMatchObject({ id: engagementId });
    engagementDeleted = true;

    await expect(
      Promise.all([
        prisma.coachingFormAutomationPolicy.count({ where: { engagementId } }),
        prisma.coachingFormAutomationReceipt.count({
          where: { policy: { engagementId } },
        }),
        prisma.coachingFormAssignment.count({ where: { engagementId } }),
      ]),
    ).resolves.toEqual([0, 0, 0]);
  });
});

async function createBooking(input: {
  prisma: ReturnType<typeof getPrismaClient>;
  engagementId: string;
  coachUserId: string;
  clientUserId: string;
  start: Date;
  status: "CONFIRMED" | "COMPLETED";
  endedAt?: Date;
}) {
  const end = new Date(input.start.getTime() + 60 * 60_000);
  const booking = await input.prisma.coachingBooking.create({
    data: {
      engagementId: input.engagementId,
      coachUserId: input.coachUserId,
      clientUserId: input.clientUserId,
      status: input.status,
      scheduledStart: input.start,
      scheduledEnd: end,
      timezone: "America/Denver",
      paymentPolicy: "FREE",
    },
  });
  await input.prisma.callRoom.create({
    data: {
      bookingId: booking.id,
      coachingEngagementId: input.engagementId,
      createdByUserId: input.coachUserId,
      purpose: "COACHING",
      status: input.endedAt ? "ENDED" : "PLANNED",
      title: "Automation Session",
      scheduledStart: input.start,
      scheduledEnd: end,
      endedAt: input.endedAt,
    },
  });
  return booking;
}
