import "server-only";

import {
  Prisma,
  UserAccountDeletionRequestStatus,
  type PrismaClient,
  type UserAccountDeletionRequest,
} from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildAccountDeletionInventory,
  type AccountDeletionInventory,
} from "@/lib/server/account-deletion-inventory";
import type { AccountDeletionExecutionPlan } from "@/lib/server/account-deletion-executor";
import {
  accountDeletionWorkerConfiguration,
  invokeAccountDeletionWorker,
} from "@/lib/server/account-deletion-worker-client";

type SelfServiceDisposition =
  | "completed"
  | "queued-for-execution"
  | "processing-attached-records";

export type SelfServiceAccountDeletionResult = {
  disposition: SelfServiceDisposition;
  request: UserAccountDeletionRequest;
  blockerCategories: string[];
};

type Dependencies = {
  prisma?: PrismaClient;
  now?: () => Date;
  buildInventory?: typeof buildAccountDeletionInventory;
  workerConfiguration?: typeof accountDeletionWorkerConfiguration;
  invokeWorker?: typeof invokeAccountDeletionWorker;
};

function object(value: Prisma.JsonValue | null | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function automaticProcessingMetadata(input: {
  existing: Prisma.JsonValue;
  evaluatedAt: Date;
  inventory: AccountDeletionInventory;
  disposition: Exclude<SelfServiceDisposition, "completed">;
}) {
  return {
    ...object(input.existing),
    automaticProcessing: {
      schemaVersion: 1,
      evaluatedAt: input.evaluatedAt.toISOString(),
      disposition: input.disposition,
      eligibleForImmediateExecution:
        input.inventory.eligibleForAutomatedExecution,
      attachedRecordCategories: input.inventory.blockers.map((blocker) => ({
        category: blocker.category,
        count: blocker.count,
      })),
    },
  } satisfies Prisma.InputJsonObject;
}

function executionPlan(input: {
  requestId: string;
  userId: string;
  approvedAt: Date;
}): AccountDeletionExecutionPlan {
  return {
    schemaVersion: 1,
    requestId: input.requestId,
    approvedByUserId: input.userId,
    approvedAt: input.approvedAt.toISOString(),
    confirmation: `DELETE ${input.requestId}`,
    exportDisposition: "not-requested",
    scope: "automated-empty-or-private-account",
  };
}

/**
 * Advances the ordinary in-app deletion flow without requiring a staff member
 * to move every request through an admin console. Accounts whose current data
 * is entirely private are handed directly to the isolated deletion worker.
 * Accounts with shared, financial, consent, or ownership records remain active
 * in the deletion state machine while category-specific retention/deletion is
 * processed; the user is never asked to inventory Quipsly themselves.
 */
export async function advanceSelfServiceAccountDeletion(input: {
  requestId: string;
  userId: string;
  dependencies?: Dependencies;
}): Promise<SelfServiceAccountDeletionResult> {
  const dependencies = input.dependencies ?? {};
  const prisma = dependencies.prisma ?? getPrismaClient();
  const now = dependencies.now?.() ?? new Date();
  const buildInventory =
    dependencies.buildInventory ?? buildAccountDeletionInventory;
  const workerConfiguration =
    dependencies.workerConfiguration ?? accountDeletionWorkerConfiguration;
  const invokeWorker = dependencies.invokeWorker ?? invokeAccountDeletionWorker;
  let request = await prisma.userAccountDeletionRequest.findUnique({
    where: { id: input.requestId },
  });

  if (!request || request.userId !== input.userId) {
    throw new Error(
      "Account deletion request does not belong to this account.",
    );
  }

  if (request.status === UserAccountDeletionRequestStatus.COMPLETED) {
    return { disposition: "completed", request, blockerCategories: [] };
  }

  const inventory = await buildInventory({
    userId: input.userId,
    prisma,
    capturedAt: now,
  });
  const blockerCategories = inventory.blockers.map(
    (blocker) => blocker.category,
  );

  if (!inventory.eligibleForAutomatedExecution) {
    request = await prisma.userAccountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: UserAccountDeletionRequestStatus.REVIEWING,
        reviewedAt: request.reviewedAt ?? now,
        metadataJson: automaticProcessingMetadata({
          existing: request.metadataJson,
          evaluatedAt: now,
          inventory,
          disposition: "processing-attached-records",
        }),
      },
    });
    return {
      disposition: "processing-attached-records",
      request,
      blockerCategories,
    };
  }

  if (
    request.status !== UserAccountDeletionRequestStatus.READY_FOR_DELETION &&
    request.status !== UserAccountDeletionRequestStatus.EXECUTING &&
    request.status !== UserAccountDeletionRequestStatus.FAILED
  ) {
    request = await prisma.userAccountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: UserAccountDeletionRequestStatus.READY_FOR_DELETION,
        reviewedAt: request.reviewedAt ?? now,
        metadataJson: automaticProcessingMetadata({
          existing: request.metadataJson,
          evaluatedAt: now,
          inventory,
          disposition: "queued-for-execution",
        }),
      },
    });
  }

  if (
    request.status === UserAccountDeletionRequestStatus.EXECUTING ||
    !workerConfiguration().enabled
  ) {
    return {
      disposition: "queued-for-execution",
      request,
      blockerCategories: [],
    };
  }

  await invokeWorker({
    requestId: request.id,
    plan: executionPlan({
      requestId: request.id,
      userId: input.userId,
      approvedAt: now,
    }),
  });

  const completed = await prisma.userAccountDeletionRequest.findUnique({
    where: { id: request.id },
  });
  if (!completed) {
    throw new Error("Account deletion completion receipt was not retained.");
  }
  return {
    disposition:
      completed.status === UserAccountDeletionRequestStatus.COMPLETED
        ? "completed"
        : "queued-for-execution",
    request: completed,
    blockerCategories: [],
  };
}
