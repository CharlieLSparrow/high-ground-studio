/** @jest-environment node */

import {
  normalizeWeeklyCommitmentIntent,
  parseWeeklyCommitmentWeekStart,
  saveWeeklyCommitmentInTransaction,
  weeklyCommitmentIntentSha256,
} from "./weekly-commitment";

const now = new Date("2026-08-03T20:00:00.000Z");
const weekStartsAt = new Date("2026-08-03T12:00:00.000Z");
const expected = new Date("2026-08-03T18:00:00.000Z");
const persisted = new Date("2026-08-03T20:01:00.000Z");

const intent = (overrides: Record<string, unknown> = {}) => ({
  clientUserId: "client-1",
  weekStartsAt,
  commitments: ["Practice the boundary", "Write down what changed"] as [string, string?],
  supportNeeded: "Review one example together",
  progressNotes: "The first attempt felt awkward.",
  clientReviewed: true,
  expectedUpdatedAt: expected,
  clientRequestId: "99999999-9999-4999-8999-999999999999",
  receiptId: "mobile-weekly-plan-99999999-9999-4999-8999-999999999999",
  surface: "ios-capture-today",
  now,
  ...overrides,
});

describe("canonical weekly commitment", () => {
  it("accepts only bounded Monday identities and normalizes authored fields", () => {
    expect(parseWeeklyCommitmentWeekStart("2026-08-03", now)).toEqual(weekStartsAt);
    expect(parseWeeklyCommitmentWeekStart("2026-08-04", now)).toBeNull();
    expect(normalizeWeeklyCommitmentIntent({
      commitmentOne: "  Practice   once  ",
      commitmentTwo: " ",
      supportNeeded: " Ask   for help ",
    })).toEqual({
      commitments: ["Practice once", undefined, undefined],
      supportNeeded: "Ask for help",
      progressNotes: null,
    });
  });

  it("creates one actor-owned plan with an exact no-side-effect receipt", async () => {
    const tx = { weeklyCommitment: {
      findUnique: jest.fn().mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({ id: "week-1", updatedAt: persisted }),
    } };
    const result = await saveWeeklyCommitmentInTransaction(tx, intent({ expectedUpdatedAt: null }));
    expect(result).toMatchObject({ kind: "saved", idempotentReplay: false, commitment: { id: "week-1" } });
    expect(tx.weeklyCommitment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientUserId: "client-1",
        weekStartsAt,
        commitmentOne: "Practice the boundary",
        clientReviewedAt: now,
        sourceJson: expect.objectContaining({
          clientPlanReceipts: [expect.objectContaining({
            clientRequestId: "99999999-9999-4999-8999-999999999999",
            intentSha256: weeklyCommitmentIntentSha256(intent()),
            externalSideEffects: false,
          })],
        }),
      }),
      select: { id: true, updatedAt: true },
    });
  });

  it("updates only the exact active revision", async () => {
    const tx = { weeklyCommitment: {
      findUnique: jest.fn()
        .mockResolvedValueOnce({ id: "week-1", status: "ACTIVE", clientReviewedAt: null, sourceJson: {}, updatedAt: expected })
        .mockResolvedValueOnce({ id: "week-1", updatedAt: persisted }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } };
    const result = await saveWeeklyCommitmentInTransaction(tx, intent());
    expect(result).toMatchObject({ kind: "saved", idempotentReplay: false });
    expect(tx.weeklyCommitment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "week-1", clientUserId: "client-1", updatedAt: expected }),
    }));
  });

  it("replays an exact request and rejects the same identity with changed intent", async () => {
    const base = intent();
    const receipt = {
      kind: "quipsly-weekly-commitment-save-v2",
      clientRequestId: base.clientRequestId,
      receiptId: base.receiptId,
      intentSha256: weeklyCommitmentIntentSha256(base),
    };
    const current = { id: "week-1", status: "ACTIVE", clientReviewedAt: now, sourceJson: { clientPlanReceipts: [receipt] }, updatedAt: persisted };
    const exact = await saveWeeklyCommitmentInTransaction({ weeklyCommitment: { findUnique: jest.fn().mockResolvedValue(current) } }, base);
    expect(exact).toMatchObject({ kind: "saved", idempotentReplay: true, commitment: { id: "week-1", updatedAt: persisted } });
    const changed = await saveWeeklyCommitmentInTransaction({ weeklyCommitment: { findUnique: jest.fn().mockResolvedValue(current) } }, intent({ progressNotes: "Different intent" }));
    expect(changed).toEqual({ kind: "identity-conflict" });
  });

  it("fails closed on stale, missing, or inactive state", async () => {
    const stale = await saveWeeklyCommitmentInTransaction({ weeklyCommitment: { findUnique: jest.fn().mockResolvedValue({ id: "week-1", status: "ACTIVE", sourceJson: {}, updatedAt: persisted }) } }, intent());
    expect(stale).toEqual({ kind: "conflict" });
    const missing = await saveWeeklyCommitmentInTransaction({ weeklyCommitment: { findUnique: jest.fn().mockResolvedValue(null) } }, intent());
    expect(missing).toEqual({ kind: "conflict" });
    const inactive = await saveWeeklyCommitmentInTransaction({ weeklyCommitment: { findUnique: jest.fn().mockResolvedValue({ id: "week-1", status: "COMPLETED", sourceJson: {}, updatedAt: expected }) } }, intent());
    expect(inactive).toEqual({ kind: "not-found" });
  });
});
