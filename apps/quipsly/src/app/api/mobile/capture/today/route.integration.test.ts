/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the mobile Today goal check-in smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("mobile Today goal check-in local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  let userId = "";
  let goalId = "";
  let expectedUpdatedAt = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { primaryEmail: `today-goal-${nonce}@example.test`, name: "Today goal smoke" },
    });
    userId = user.id;
    const goal = await prisma.goal.create({
      data: {
        ownerUserId: user.id,
        title: "Proof-listen a real coaching follow-up",
        status: "ACTIVE",
        sourceJson: { source: "quipsly-work-manual-goal-v1" },
      },
    });
    goalId = goal.id;
    expectedUpdatedAt = goal.updatedAt.toISOString();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: user.id, primaryEmail: user.primaryEmail },
    } as any);
  });

  afterAll(async () => {
    try {
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists one actor-owned evidence receipt while leaving goal status and external systems unchanged", async () => {
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal-progress",
        id: goalId,
        progressPercent: 75,
        note: "Proof-listened the first act against the source audio.",
        expectedUpdatedAt,
      }),
    }));
    const payload = await response.json();
    const [goal, progressReceipts] = await Promise.all([
      prisma.goal.findUnique({ where: { id: goalId } }),
      prisma.goalProgressReceipt.findMany({ where: { goalId }, orderBy: { occurredAt: "asc" } }),
    ]);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      action: "goal-progress",
      progressPercent: 75,
      status: "ACTIVE",
      boundaries: {
        goalCheckInMutatesStatus: false,
        externalCalendarMutated: false,
        providerMutated: false,
      },
    });
    expect(goal).toMatchObject({ id: goalId, ownerUserId: userId, status: "ACTIVE", achievedAt: null });
    expect(goal?.sourceJson).toMatchObject({
      source: "quipsly-work-manual-goal-v1",
      lastProgressReceipt: {
        id: payload.receiptId,
        kind: "quipsly-goal-progress-v1",
        surface: "ios-capture-today",
        progressPercent: 75,
        note: "Proof-listened the first act against the source audio.",
        recordedByUserId: userId,
        externalSideEffects: false,
        goalStatusMutated: false,
      },
    });
    expect(progressReceipts).toHaveLength(1);
    expect(progressReceipts[0]).toMatchObject({
      actorUserId: userId,
      kind: "PROGRESS",
      progressPercent: 75,
      note: "Proof-listened the first act against the source audio.",
    });
  });
});
