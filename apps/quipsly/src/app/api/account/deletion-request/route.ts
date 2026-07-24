import { UserAccountDeletionRequestStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  accountDeletionPolicyResponse,
  projectAccountDeletionRequest,
} from "@/lib/server/account-deletion-policy";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

const OPEN_DELETION_STATUSES: UserAccountDeletionRequestStatus[] = [
  UserAccountDeletionRequestStatus.REQUESTED,
  UserAccountDeletionRequestStatus.REVIEWING,
  UserAccountDeletionRequestStatus.EXPORT_PREPARING,
  UserAccountDeletionRequestStatus.READY_FOR_DELETION,
  UserAccountDeletionRequestStatus.EXECUTING,
  UserAccountDeletionRequestStatus.FAILED,
];

async function requireUser(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return null;
  }

  return session.user;
}

export async function GET(request: Request) {
  const user = await requireUser(request);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to review your account deletion request." },
      { status: 401 },
    );
  }

  const prisma = getPrismaClient();
  const latest = await prisma.userAccountDeletionRequest.findFirst({
    where: { userId: user.id },
    orderBy: { requestedAt: "desc" },
  });

  const projected = latest ? projectAccountDeletionRequest(latest) : null;

  return NextResponse.json({
    ok: true,
    request: projected,
    policy: accountDeletionPolicyResponse(),
    nextAction:
      projected?.nextAction ??
      "No account deletion request is recorded. You can start one from Account in the Quipsly iPhone app.",
  });
}

export async function POST(request: Request) {
  const user = await requireUser(request);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before requesting account deletion." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const reason = text(body.reason).slice(0, 2000) || null;
  const source = text(body.source).slice(0, 120) || "quipsly-mobile";
  const prisma = getPrismaClient();
  const existing = await prisma.userAccountDeletionRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: OPEN_DELETION_STATUSES },
    },
    orderBy: { requestedAt: "desc" },
  });

  if (existing) {
    const projected = projectAccountDeletionRequest(existing);
    return NextResponse.json({
      ok: true,
      message: "Deletion request already recorded.",
      request: { ...projected, reusedExistingRequest: true },
      policy: accountDeletionPolicyResponse(),
      nextAction: projected.nextAction,
    });
  }

  const deletionRequest = await prisma.userAccountDeletionRequest.create({
    data: {
      userId: user.id,
      emailSnapshot: user.primaryEmail || "unknown",
      reason,
      source,
      metadataJson: {
        source,
        requestedByUserId: user.id,
        requestedByEmail: user.primaryEmail || null,
        appSurface: text(body.appSurface) || null,
        userAgent: request.headers.get("user-agent"),
        createdAt: new Date().toISOString(),
        retentionReviewRequired: true,
        policyVersion: accountDeletionPolicyResponse().version,
        targetDays: accountDeletionPolicyResponse().targetDays,
      },
    },
  });

  const projected = projectAccountDeletionRequest(deletionRequest);
  return NextResponse.json({
    ok: true,
    message: "Deletion request recorded.",
    request: { ...projected, reusedExistingRequest: false },
    policy: accountDeletionPolicyResponse(),
    nextAction: projected.nextAction,
  });
}
