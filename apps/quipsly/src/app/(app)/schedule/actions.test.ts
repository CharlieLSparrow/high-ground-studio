import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { createWorkPlanBlock, rescheduleWorkPlanBlock, updateWorkPlanBlockStatus } from "./actions";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const expected = new Date("2026-07-18T18:00:00.000Z");
const persisted = new Date("2026-07-18T18:00:01.000Z");

function signedIn() {
  jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1" } } as any);
}

describe("personal focus-block decisions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails before database access when signed out", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    const result = await createWorkPlanBlock({ targetType: "task", targetId: "task-1", startsAt: "2026-07-19T12:00", durationMinutes: 50, timezone: "America/Denver" });
    expect(result).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("plans one accessible open task without mutating calendar or target state", async () => {
    signedIn();
    const tx = {
      actionItem: { findFirst: jest.fn().mockResolvedValue({ id: "task-1", sourceJson: { source: "quipsly-work-manual-v1" } }) },
      workPlanBlock: { create: jest.fn().mockResolvedValue({ id: "block-1", updatedAt: persisted }) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await createWorkPlanBlock({ targetType: "task", targetId: "task-1", startsAt: "2026-07-19T12:00", durationMinutes: 50, timezone: "America/Denver" });
    expect(result).toMatchObject({ ok: true, planBlockId: "block-1", receiptId: expect.any(String) });
    expect(tx.workPlanBlock.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ownerUserId: "user-1",
      actionItemId: "task-1",
      goalId: null,
      startsAt: new Date("2026-07-19T18:00:00.000Z"),
      endsAt: new Date("2026-07-19T18:50:00.000Z"),
      sourceJson: expect.objectContaining({ creationReceipt: expect.objectContaining({
        requestedLocalDateTime: "2026-07-19T12:00",
        resolvedLocalDateTime: "2026-07-19T12:00",
        dstResolution: "exact",
        externalCalendarMutated: false,
        targetStatusMutated: false,
      }) }),
    }) }));
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it("completes the personal block without completing its task or goal", async () => {
    signedIn();
    const tx = { workPlanBlock: {
      findFirst: jest.fn().mockResolvedValue({ status: "PLANNED", actualMinutes: null, sourceJson: {}, updatedAt: expected }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ actualMinutes: 35, updatedAt: persisted }),
    } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateWorkPlanBlockStatus({ planBlockId: "block-1", nextStatus: "COMPLETED", actualMinutes: 35, expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, status: "COMPLETED", actualMinutes: 35, updatedAt: persisted.toISOString() });
    expect(tx.workPlanBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "COMPLETED",
      completedAt: expect.any(Date),
      actualMinutes: 35,
      sourceJson: expect.objectContaining({ planReceipts: [expect.objectContaining({ externalCalendarMutated: false, targetStatusMutated: false })] }),
    }) }));
    expect(tx).not.toHaveProperty("actionItem");
    expect(tx).not.toHaveProperty("goal");
  });

  it("reschedules with optimistic concurrency and resets only the block", async () => {
    signedIn();
    const tx = { workPlanBlock: {
      findFirst: jest.fn().mockResolvedValue({ status: "SKIPPED", sourceJson: {}, updatedAt: expected }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: "PLANNED", actualMinutes: null, updatedAt: persisted }),
    } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await rescheduleWorkPlanBlock({ planBlockId: "block-1", startsAt: "2026-07-20T12:00", durationMinutes: 90, timezone: "America/Denver", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, status: "PLANNED" });
    expect(tx.workPlanBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      startsAt: new Date("2026-07-20T18:00:00.000Z"),
      endsAt: new Date("2026-07-20T19:30:00.000Z"),
      status: "PLANNED",
      completedAt: null,
    }) }));
  });
});
