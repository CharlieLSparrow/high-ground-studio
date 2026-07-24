import { UserAccountDeletionRequestStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  executeAccountDeletion,
  type AccountDeletionExecutionPlan,
} from "@/lib/server/account-deletion-executor";
import { buildAccountDeletionInventory } from "@/lib/server/account-deletion-inventory";
import { projectAccountDeletionRequest } from "@/lib/server/account-deletion-policy";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

async function requireStaff(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  return session?.user?.isStaff ? session.user : null;
}

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const staff = await requireStaff(request);
  if (!staff) {
    return error("Only Quipsly staff can review account deletion work.", 403);
  }

  const { requestId } = await context.params;
  const prisma = getPrismaClient();
  const deletionRequest = await prisma.userAccountDeletionRequest.findUnique({
    where: { id: requestId },
    include: {
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!deletionRequest) {
    return error("Account deletion request was not found.", 404);
  }

  const latestExecution = deletionRequest.executions[0] ?? null;
  const inventory = latestExecution
    ? latestExecution.inventoryJson
    : deletionRequest.userId
      ? await buildAccountDeletionInventory({
          userId: deletionRequest.userId,
          prisma,
        })
      : null;

  return NextResponse.json({
    ok: true,
    request: projectAccountDeletionRequest(deletionRequest),
    inventory,
    execution: latestExecution
      ? {
          id: latestExecution.id,
          status: latestExecution.status,
          executorVersion: latestExecution.executorVersion,
          policyVersion: latestExecution.policyVersion,
          startedAt: latestExecution.startedAt,
          finishedAt: latestExecution.finishedAt,
          hasReceipt: latestExecution.receiptJson !== null,
          hasFailure: latestExecution.failureJson !== null,
        }
      : null,
    controls: {
      executorEnabled:
        process.env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED === "true",
      confirmationPhrase: `DELETE ${deletionRequest.id}`,
      canExecute:
        deletionRequest.status ===
          UserAccountDeletionRequestStatus.READY_FOR_DELETION ||
        deletionRequest.status === UserAccountDeletionRequestStatus.FAILED,
      supportedScope: "automated-empty-or-private-account",
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const staff = await requireStaff(request);
  if (!staff) {
    return error("Only Quipsly staff can execute account deletion work.", 403);
  }

  const { requestId } = await context.params;
  const body = await readJson(request);
  const confirmation =
    typeof body.confirmation === "string" ? body.confirmation : "";
  const exportDisposition = body.exportDisposition;

  if (confirmation !== `DELETE ${requestId}`) {
    return error(
      `Type DELETE ${requestId} exactly to authorize this deletion.`,
      400,
    );
  }
  if (
    exportDisposition !== "not-requested" &&
    exportDisposition !== "declined" &&
    exportDisposition !== "delivered"
  ) {
    return error(
      "exportDisposition must be not-requested, declined, or delivered.",
      400,
    );
  }

  const plan: AccountDeletionExecutionPlan = {
    schemaVersion: 1,
    requestId,
    approvedByUserId: staff.id,
    approvedAt: new Date().toISOString(),
    confirmation,
    exportDisposition,
    scope: "automated-empty-or-private-account",
  };

  try {
    const receipt = await executeAccountDeletion({ requestId, plan });
    return NextResponse.json({
      ok: true,
      message: "Account deletion completed with a durable executor receipt.",
      receipt,
    });
  } catch (executionError) {
    const message =
      executionError instanceof Error
        ? executionError.message
        : "Account deletion could not be executed.";
    const disabled = message.includes("executor is disabled");
    const reviewRequired = message.includes("reviewed retention plan");
    return error(message, disabled ? 503 : reviewRequired ? 409 : 500);
  }
}
