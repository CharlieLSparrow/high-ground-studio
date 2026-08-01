"use server";

import { UserAccountDeletionRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildAccountDeletionInventory,
  explainAccountDeletionBlockers,
} from "@/lib/server/account-deletion-inventory";
import { invokeAccountDeletionWorker } from "@/lib/server/account-deletion-worker-client";
import { requireQuipslyAdminActor } from "@/lib/server/user-management";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function returnToConsole(params: URLSearchParams) {
  revalidatePath("/admin/account-deletion");
  redirect(`/admin/account-deletion?${params.toString()}`);
}

function failureParams(error: unknown) {
  const params = new URLSearchParams();
  params.set(
    "error",
    (error instanceof Error
      ? error.message
      : "Account deletion operation failed."
    ).slice(0, 500),
  );
  return params;
}

export async function advanceAccountDeletionReviewAction(formData: FormData) {
  await requireQuipslyAdminActor();
  const requestId = text(formData.get("requestId"));
  const transition = text(formData.get("transition"));
  const prisma = getPrismaClient();

  try {
    if (!requestId) throw new Error("Deletion request ID is required.");

    if (transition === "start-review") {
      const updated = await prisma.userAccountDeletionRequest.updateMany({
        where: {
          id: requestId,
          status: UserAccountDeletionRequestStatus.REQUESTED,
        },
        data: {
          status: UserAccountDeletionRequestStatus.REVIEWING,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Only a newly requested deletion can enter review.");
      }
    } else if (transition === "prepare-export") {
      const updated = await prisma.userAccountDeletionRequest.updateMany({
        where: {
          id: requestId,
          status: UserAccountDeletionRequestStatus.REVIEWING,
        },
        data: {
          status: UserAccountDeletionRequestStatus.EXPORT_PREPARING,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Start review before preparing an export.");
      }
    } else if (transition === "ready") {
      const deletionRequest =
        await prisma.userAccountDeletionRequest.findUnique({
          where: { id: requestId },
          select: { userId: true, status: true },
        });
      if (!deletionRequest?.userId) {
        throw new Error("Deletion request has no active account subject.");
      }
      if (
        deletionRequest.status !== UserAccountDeletionRequestStatus.REVIEWING &&
        deletionRequest.status !==
          UserAccountDeletionRequestStatus.EXPORT_PREPARING
      ) {
        throw new Error("Only a reviewed deletion request can become ready.");
      }
      const inventory = await buildAccountDeletionInventory({
        userId: deletionRequest.userId,
        prisma,
      });
      if (!inventory.eligibleForAutomatedExecution) {
        throw new Error(
          [
            "This account needs a reviewed retention plan.",
            ...explainAccountDeletionBlockers(inventory),
          ].join(" "),
        );
      }
      const updated = await prisma.userAccountDeletionRequest.updateMany({
        where: {
          id: requestId,
          status: deletionRequest.status,
          userId: deletionRequest.userId,
        },
        data: {
          status: UserAccountDeletionRequestStatus.READY_FOR_DELETION,
        },
      });
      if (updated.count !== 1) {
        throw new Error(
          "Deletion request changed while readiness was being recorded.",
        );
      }
    } else {
      throw new Error("Unsupported account deletion review transition.");
    }
  } catch (error) {
    returnToConsole(failureParams(error));
  }
  const params = new URLSearchParams({ updated: requestId });
  returnToConsole(params);
}

export async function executeAccountDeletionAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const requestId = text(formData.get("requestId"));
  const confirmation = text(formData.get("confirmation"));
  const exportDisposition = text(formData.get("exportDisposition"));

  try {
    if (!actor.userId) {
      throw new Error(
        "The operator needs an app-owned user ID before approving deletion.",
      );
    }
    if (!requestId || confirmation !== `DELETE ${requestId}`) {
      throw new Error(`Type DELETE ${requestId} exactly to continue.`);
    }
    if (
      exportDisposition !== "not-requested" &&
      exportDisposition !== "declined" &&
      exportDisposition !== "delivered"
    ) {
      throw new Error("Record the account export disposition.");
    }

    await invokeAccountDeletionWorker({
      requestId,
      plan: {
        schemaVersion: 1,
        requestId,
        approvedByUserId: actor.userId,
        approvedAt: new Date().toISOString(),
        confirmation,
        exportDisposition,
        scope: "automated-empty-or-private-account",
      },
    });
  } catch (error) {
    returnToConsole(failureParams(error));
  }
  const params = new URLSearchParams({ completed: requestId });
  returnToConsole(params);
}
