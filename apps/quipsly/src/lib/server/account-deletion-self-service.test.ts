/** @jest-environment node */

import { UserAccountDeletionRequestStatus } from "@prisma/client";

import { advanceSelfServiceAccountDeletion } from "./account-deletion-self-service";

function deletionRequest(
  status: UserAccountDeletionRequestStatus = UserAccountDeletionRequestStatus.REQUESTED,
) {
  return {
    id: "request-1",
    userId: "user-1",
    emailSnapshot: "person@example.test",
    status,
    reason: null,
    source: "ios-capture",
    requestedAt: new Date("2026-08-27T12:00:00.000Z"),
    reviewedAt: null,
    executionStartedAt: null,
    completedAt: null,
    failedAt: null,
    canceledAt: null,
    executionReceiptJson: null,
    lastFailureJson: null,
    metadataJson: { userConfirmedDeletion: true },
    createdAt: new Date("2026-08-27T12:00:00.000Z"),
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  };
}

function inventory(blockers: Array<{ category: string; count: number }> = []) {
  return {
    schemaVersion: 1 as const,
    capturedAt: "2026-08-27T12:01:00.000Z",
    subject: {
      userId: "user-1",
      primaryEmail: "person@example.test",
      firebaseUid: "firebase-1",
      firebaseUids: ["firebase-1"],
      isActive: true,
      allEmails: ["person@example.test"],
    },
    homeNests: [],
    blockers: blockers.map((blocker) => ({
      ...blocker,
      reason: `${blocker.category} requires automatic attached-record processing.`,
    })),
    eligibleForAutomatedExecution: blockers.length === 0,
  };
}

describe("self-service account deletion", () => {
  const now = new Date("2026-08-27T12:01:00.000Z");
  const findUnique = jest.fn();
  const update = jest.fn();
  const buildInventory = jest.fn();
  const invokeWorker = jest.fn();
  const workerConfiguration = jest.fn();
  const prisma = {
    userAccountDeletionRequest: { findUnique, update },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(deletionRequest());
    update.mockImplementation(async ({ data }) => ({
      ...deletionRequest(),
      ...data,
      metadataJson: data.metadataJson ?? {},
    }));
    buildInventory.mockResolvedValue(inventory());
    workerConfiguration.mockReturnValue({ enabled: false });
  });

  it("queues a private account automatically without requiring staff review", async () => {
    const result = await advanceSelfServiceAccountDeletion({
      requestId: "request-1",
      userId: "user-1",
      dependencies: {
        prisma: prisma as never,
        now: () => now,
        buildInventory,
        workerConfiguration,
        invokeWorker,
      },
    });

    expect(result.disposition).toBe("queued-for-execution");
    expect(update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: UserAccountDeletionRequestStatus.READY_FOR_DELETION,
        reviewedAt: now,
        metadataJson: expect.objectContaining({
          userConfirmedDeletion: true,
          automaticProcessing: expect.objectContaining({
            disposition: "queued-for-execution",
            eligibleForImmediateExecution: true,
          }),
        }),
      }),
    });
    expect(invokeWorker).not.toHaveBeenCalled();
  });

  it("keeps shared records in automatic processing without asking the user to inventory them", async () => {
    buildInventory.mockResolvedValue(
      inventory([
        { category: "session-participation", count: 2 },
        { category: "financial-records", count: 1 },
      ]),
    );

    const result = await advanceSelfServiceAccountDeletion({
      requestId: "request-1",
      userId: "user-1",
      dependencies: {
        prisma: prisma as never,
        now: () => now,
        buildInventory,
        workerConfiguration,
        invokeWorker,
      },
    });

    expect(result).toMatchObject({
      disposition: "processing-attached-records",
      blockerCategories: ["session-participation", "financial-records"],
      request: { status: UserAccountDeletionRequestStatus.REVIEWING },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: UserAccountDeletionRequestStatus.REVIEWING,
        metadataJson: expect.objectContaining({
          automaticProcessing: expect.objectContaining({
            disposition: "processing-attached-records",
            attachedRecordCategories: [
              { category: "session-participation", count: 2 },
              { category: "financial-records", count: 1 },
            ],
          }),
        }),
      }),
    });
    expect(invokeWorker).not.toHaveBeenCalled();
  });

  it("hands an eligible request directly to the isolated worker", async () => {
    workerConfiguration.mockReturnValue({ enabled: true });
    findUnique
      .mockResolvedValueOnce(deletionRequest())
      .mockResolvedValueOnce(
        deletionRequest(UserAccountDeletionRequestStatus.COMPLETED),
      );
    invokeWorker.mockResolvedValue({
      schemaVersion: 1,
      outcome: "completed",
      requestId: "request-1",
    });

    const result = await advanceSelfServiceAccountDeletion({
      requestId: "request-1",
      userId: "user-1",
      dependencies: {
        prisma: prisma as never,
        now: () => now,
        buildInventory,
        workerConfiguration,
        invokeWorker,
      },
    });

    expect(result.disposition).toBe("completed");
    expect(invokeWorker).toHaveBeenCalledWith({
      requestId: "request-1",
      plan: {
        schemaVersion: 1,
        requestId: "request-1",
        approvedByUserId: "user-1",
        approvedAt: now.toISOString(),
        confirmation: "DELETE request-1",
        exportDisposition: "not-requested",
        scope: "automated-empty-or-private-account",
      },
    });
  });
});
