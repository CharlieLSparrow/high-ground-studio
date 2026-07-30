import "server-only";

import { createHash } from "node:crypto";

import {
  Prisma,
  UserAccountDeletionExecutionStatus,
  UserAccountDeletionRequestStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  createAccountDeletionExternalServices,
  type AccountDeletionExternalServices,
} from "@/lib/server/account-deletion-external";
import {
  buildAccountDeletionInventory,
  explainAccountDeletionBlockers,
  type AccountDeletionInventory,
} from "@/lib/server/account-deletion-inventory";
import { ACCOUNT_DELETION_POLICY } from "@/lib/server/account-deletion-policy";

export const ACCOUNT_DELETION_EXECUTOR_VERSION = "2026-07-24.v1";

export type AccountDeletionExecutionPlan = {
  schemaVersion: 1;
  requestId: string;
  approvedByUserId: string;
  approvedAt: string;
  confirmation: string;
  exportDisposition: "not-requested" | "declined" | "delivered";
  scope: "automated-empty-or-private-account" | "reviewed-retention-plan";
};

type ExecutionProgress = {
  authDisabledAt?: string;
  databaseDeletedAt?: string;
  storageDeletedAt?: string;
  firebaseDeletedAt?: string;
  confirmationSentAt?: string;
};

type CompletionReceipt = {
  schemaVersion: 1;
  outcome: "completed";
  requestId: string;
  executorVersion: string;
  policyVersion: string;
  planSha256: string;
  completedAt: string;
  deletedHomeNestCount: number;
  deletedStorageObjectCount: number;
  retainedCategories: string[];
  confirmation: "sent";
};

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function stablePlanHash(plan: AccountDeletionExecutionPlan) {
  // approvedAt is evidence on the first stored plan, not a semantic choice.
  // Recovery forms submit a fresh server timestamp; excluding it lets the same
  // operator resume the same approved scope without weakening any decision.
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: plan.schemaVersion,
        requestId: plan.requestId,
        approvedByUserId: plan.approvedByUserId,
        confirmation: plan.confirmation,
        exportDisposition: plan.exportDisposition,
        scope: plan.scope,
      }),
    )
    .digest("hex");
}

function validatePlan(plan: AccountDeletionExecutionPlan) {
  if (plan.schemaVersion !== 1) {
    throw new Error("Unsupported account deletion execution plan version.");
  }
  if (plan.confirmation !== `DELETE ${plan.requestId}`) {
    throw new Error(
      `Account deletion confirmation must exactly match DELETE ${plan.requestId}.`,
    );
  }
  const approvedAt = new Date(plan.approvedAt);
  if (Number.isNaN(approvedAt.getTime())) {
    throw new Error("Account deletion plan has an invalid approval time.");
  }
  if (plan.scope !== "automated-empty-or-private-account") {
    throw new Error(
      "The current executor only completes accounts with no shared, regulated, or ambiguous retention records.",
    );
  }
}

function sanitizedFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown account deletion failure.";
  return {
    code: "ACCOUNT_DELETION_EXECUTION_FAILED",
    message: message.slice(0, 1_000),
    at: new Date().toISOString(),
  };
}

function asInventory(value: Prisma.JsonValue): AccountDeletionInventory {
  const object = jsonObject(value);
  if (
    object.schemaVersion !== 1 ||
    typeof object.eligibleForAutomatedExecution !== "boolean" ||
    !object.subject ||
    !Array.isArray(object.homeNests) ||
    !Array.isArray(object.blockers)
  ) {
    throw new Error("Stored account deletion inventory is invalid.");
  }
  return value as unknown as AccountDeletionInventory;
}

function asPlan(value: Prisma.JsonValue): AccountDeletionExecutionPlan {
  const object = jsonObject(value);
  if (
    object.schemaVersion !== 1 ||
    typeof object.requestId !== "string" ||
    typeof object.approvedByUserId !== "string"
  ) {
    throw new Error("Stored account deletion execution plan is invalid.");
  }
  return value as unknown as AccountDeletionExecutionPlan;
}

function asProgress(value: Prisma.JsonValue): ExecutionProgress {
  return jsonObject(value) as ExecutionProgress;
}

function firebaseUidsForInventory(
  inventory: AccountDeletionInventory,
): string[] {
  return [
    ...new Set(
      [
        ...(inventory.subject.firebaseUids ?? []),
        inventory.subject.firebaseUid,
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
}

async function markProgress(input: {
  prisma: PrismaClient;
  executionId: string;
  progress: ExecutionProgress;
}) {
  await input.prisma.userAccountDeletionExecution.update({
    where: { id: input.executionId },
    data: {
      progressJson: input.progress as Prisma.InputJsonValue,
    },
  });
}

export async function executeAccountDeletion(input: {
  requestId: string;
  plan: AccountDeletionExecutionPlan;
  prisma?: PrismaClient;
  external?: AccountDeletionExternalServices;
  allowExecutionWithoutEnvironmentGate?: boolean;
}) {
  if (
    !input.allowExecutionWithoutEnvironmentGate &&
    process.env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED !== "true"
  ) {
    throw new Error(
      "Account deletion executor is disabled. Set QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=true only in the controlled deletion worker.",
    );
  }

  validatePlan(input.plan);
  if (input.plan.requestId !== input.requestId) {
    throw new Error(
      "Account deletion plan does not match the requested record.",
    );
  }

  const prisma = input.prisma ?? getPrismaClient();
  const external = input.external ?? createAccountDeletionExternalServices();
  const idempotencyKey = `account-deletion:${input.requestId}`;
  const requestedPlanHash = stablePlanHash(input.plan);
  let request = await prisma.userAccountDeletionRequest.findUnique({
    where: { id: input.requestId },
    include: { user: true },
  });

  if (!request) {
    throw new Error("Account deletion request was not found.");
  }

  if (
    request.status === UserAccountDeletionRequestStatus.COMPLETED &&
    jsonObject(request.executionReceiptJson).outcome === "completed"
  ) {
    return request.executionReceiptJson as CompletionReceipt;
  }

  let execution = await prisma.userAccountDeletionExecution.findUnique({
    where: { idempotencyKey },
  });
  let inventory: AccountDeletionInventory;
  let plan: AccountDeletionExecutionPlan;

  if (execution) {
    inventory = asInventory(execution.inventoryJson);
    plan = asPlan(execution.planJson);
    if (stablePlanHash(plan) !== requestedPlanHash) {
      throw new Error(
        "Account deletion execution already started with a different immutable plan.",
      );
    }
    if (
      execution.status === UserAccountDeletionExecutionStatus.SUCCEEDED &&
      jsonObject(execution.receiptJson).outcome === "completed"
    ) {
      return execution.receiptJson as CompletionReceipt;
    }
    if (
      execution.status === UserAccountDeletionExecutionStatus.FAILED &&
      request.status !== UserAccountDeletionRequestStatus.FAILED
    ) {
      throw new Error(
        "Account deletion recovery state is inconsistent and requires operator review.",
      );
    }
    if (
      execution.status === UserAccountDeletionExecutionStatus.RUNNING &&
      request.status !== UserAccountDeletionRequestStatus.EXECUTING
    ) {
      throw new Error(
        "Account deletion execution state is inconsistent and requires operator review.",
      );
    }
    if (execution.status === UserAccountDeletionExecutionStatus.FAILED) {
      const recoveredAt = new Date();
      await prisma.$transaction([
        prisma.userAccountDeletionExecution.update({
          where: { id: execution.id },
          data: {
            status: UserAccountDeletionExecutionStatus.RUNNING,
            failureJson: Prisma.JsonNull,
            finishedAt: null,
          },
        }),
        prisma.userAccountDeletionRequest.update({
          where: { id: request.id },
          data: {
            status: UserAccountDeletionRequestStatus.EXECUTING,
            executionStartedAt: request.executionStartedAt ?? recoveredAt,
            failedAt: null,
            lastFailureJson: Prisma.JsonNull,
          },
        }),
        prisma.user.updateMany({
          where: { id: inventory.subject.userId },
          data: { isActive: false },
        }),
      ]);
      execution = await prisma.userAccountDeletionExecution.findUniqueOrThrow({
        where: { id: execution.id },
      });
      request = await prisma.userAccountDeletionRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { user: true },
      });
    }
  } else {
    if (
      request.status !== UserAccountDeletionRequestStatus.READY_FOR_DELETION
    ) {
      throw new Error(
        "Account deletion must finish review before execution can start.",
      );
    }
    if (!request.userId || !request.user) {
      throw new Error(
        "Account deletion request is detached without a prior execution receipt.",
      );
    }
    const requestId = request.id;
    const subjectUserId = request.userId;

    inventory = await buildAccountDeletionInventory({
      userId: subjectUserId,
      prisma,
    });
    if (!inventory.eligibleForAutomatedExecution) {
      throw new Error(
        [
          "Account requires a reviewed retention plan before deletion.",
          ...explainAccountDeletionBlockers(inventory),
        ].join(" "),
      );
    }
    plan = input.plan;

    execution = await prisma.$transaction(async (tx) => {
      const claimed = await tx.userAccountDeletionRequest.updateMany({
        where: {
          id: requestId,
          status: UserAccountDeletionRequestStatus.READY_FOR_DELETION,
          userId: subjectUserId,
        },
        data: {
          status: UserAccountDeletionRequestStatus.EXECUTING,
          executionStartedAt: new Date(),
          failedAt: null,
          lastFailureJson: Prisma.JsonNull,
        },
      });
      if (claimed.count !== 1) {
        throw new Error(
          "Account deletion request changed while execution was being claimed.",
        );
      }

      await tx.user.update({
        where: { id: subjectUserId },
        data: { isActive: false },
      });
      return tx.userAccountDeletionExecution.create({
        data: {
          requestId,
          idempotencyKey,
          executorVersion: ACCOUNT_DELETION_EXECUTOR_VERSION,
          policyVersion: ACCOUNT_DELETION_POLICY.version,
          inventoryJson: inventory as unknown as Prisma.InputJsonValue,
          planJson: plan as unknown as Prisma.InputJsonValue,
          progressJson: {},
        },
      });
    });
    request = await prisma.userAccountDeletionRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { user: true },
    });
  }

  let progress = asProgress(execution.progressJson);
  const now = () => new Date().toISOString();

  try {
    if (!progress.authDisabledAt) {
      for (const firebaseUid of firebaseUidsForInventory(inventory)) {
        await external.disableFirebaseIdentity(firebaseUid);
      }
      progress = { ...progress, authDisabledAt: now() };
      await markProgress({ prisma, executionId: execution.id, progress });
    }

    if (!progress.databaseDeletedAt) {
      const homeProjectIds = inventory.homeNests.map((project) => project.id);
      const emails = inventory.subject.allEmails;
      await prisma.$transaction(async (tx) => {
        // Personal writing documents inside shared Nests belong to the account
        // subject and must be removed before the restrictive owner relation
        // allows the person record to be deleted. Shared project documents are
        // deliberately untouched.
        await tx.studioDocument.deleteMany({
          where: { personalOwnerUserId: inventory.subject.userId },
        });
        await tx.actionItem.deleteMany({
          where: {
            OR: [
              ...(homeProjectIds.length > 0
                ? [{ projectId: { in: homeProjectIds } }]
                : []),
              {
                assignedUserId: inventory.subject.userId,
                projectId: null,
                roomId: null,
                bookingId: null,
                noteId: null,
              },
            ],
          },
        });
        await tx.studioProjectAccessGrant.deleteMany({
          where: { email: { in: emails } },
        });
        await tx.studioNestInvite.deleteMany({
          where: { email: { in: emails } },
        });
        if (homeProjectIds.length > 0) {
          await tx.studioProject.deleteMany({
            where: { id: { in: homeProjectIds } },
          });
        }
        const deleted = await tx.user.deleteMany({
          where: { id: inventory.subject.userId, isActive: false },
        });
        if (deleted.count !== 1) {
          throw new Error(
            "Account subject was not deleted after access deactivation.",
          );
        }
        const nextProgress = { ...progress, databaseDeletedAt: now() };
        await tx.userAccountDeletionExecution.update({
          where: { id: execution.id },
          data: {
            progressJson: nextProgress as Prisma.InputJsonValue,
          },
        });
      });
      progress = { ...progress, databaseDeletedAt: now() };
    }

    const storageObjects = inventory.homeNests.flatMap(
      (project) => project.exclusiveStorageObjects,
    );
    if (!progress.storageDeletedAt) {
      for (const object of storageObjects) {
        await external.deleteStorageObject(object);
      }
      if (storageObjects.length > 0) {
        await prisma.studioMediaAsset.deleteMany({
          where: {
            id: { in: storageObjects.map((object) => object.assetId) },
            projects: { none: {} },
          },
        });
      }
      progress = { ...progress, storageDeletedAt: now() };
      await markProgress({ prisma, executionId: execution.id, progress });
    }

    if (!progress.firebaseDeletedAt) {
      for (const firebaseUid of firebaseUidsForInventory(inventory)) {
        await external.deleteFirebaseIdentity(firebaseUid);
      }
      progress = { ...progress, firebaseDeletedAt: now() };
      await markProgress({ prisma, executionId: execution.id, progress });
    }

    const confirmationEmail =
      request.emailSnapshot || inventory.subject.primaryEmail;
    if (!progress.confirmationSentAt) {
      await external.sendCompletionConfirmation({
        email: confirmationEmail,
        requestId: request.id,
        idempotencyKey: `${idempotencyKey}:completion-email`,
      });
      progress = { ...progress, confirmationSentAt: now() };
      await markProgress({ prisma, executionId: execution.id, progress });
    }

    const completedAt = new Date();
    const receipt: CompletionReceipt = {
      schemaVersion: 1,
      outcome: "completed",
      requestId: request.id,
      executorVersion: ACCOUNT_DELETION_EXECUTOR_VERSION,
      policyVersion: ACCOUNT_DELETION_POLICY.version,
      planSha256: requestedPlanHash,
      completedAt: completedAt.toISOString(),
      deletedHomeNestCount: inventory.homeNests.length,
      deletedStorageObjectCount: storageObjects.length,
      retainedCategories: [],
      confirmation: "sent",
    };

    await prisma.$transaction([
      prisma.userAccountDeletionExecution.update({
        where: { id: execution.id },
        data: {
          status: UserAccountDeletionExecutionStatus.SUCCEEDED,
          progressJson: progress as Prisma.InputJsonValue,
          receiptJson: receipt as unknown as Prisma.InputJsonValue,
          failureJson: Prisma.JsonNull,
          finishedAt: completedAt,
        },
      }),
      prisma.userAccountDeletionRequest.update({
        where: { id: request.id },
        data: {
          userId: null,
          emailSnapshot: null,
          status: UserAccountDeletionRequestStatus.COMPLETED,
          completedAt,
          failedAt: null,
          executionReceiptJson: receipt as unknown as Prisma.InputJsonValue,
          lastFailureJson: Prisma.JsonNull,
        },
      }),
    ]);

    return receipt;
  } catch (error) {
    const failure = sanitizedFailure(error);
    await prisma.$transaction([
      prisma.userAccountDeletionExecution.update({
        where: { id: execution.id },
        data: {
          status: UserAccountDeletionExecutionStatus.FAILED,
          progressJson: progress as Prisma.InputJsonValue,
          failureJson: failure,
          finishedAt: new Date(),
        },
      }),
      prisma.userAccountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: UserAccountDeletionRequestStatus.FAILED,
          failedAt: new Date(),
          lastFailureJson: failure,
        },
      }),
    ]);
    throw error;
  }
}
