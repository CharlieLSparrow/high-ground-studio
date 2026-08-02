import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  executeAccountDeletion,
  type AccountDeletionExecutionPlan,
} from "@/lib/server/account-deletion-executor";
import { accountDeletionEmailConfiguration } from "@/lib/server/account-deletion-email";

export const dynamic = "force-dynamic";
export const maxDuration = 900;
const ACCOUNT_DELETION_WORKER_SECRET_HEADER =
  "x-quipsly-account-deletion-worker-secret";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function authorized(request: Request) {
  const expectedSecret =
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET?.trim() ?? "";
  const presentedSecret =
    request.headers.get(ACCOUNT_DELETION_WORKER_SECRET_HEADER)?.trim() ?? "";
  return (
    Buffer.byteLength(expectedSecret, "utf8") >= 32 &&
    safeEqual(presentedSecret, expectedSecret)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return error("Account deletion worker authorization failed.", 403);
  }
  const bucketAllowlist =
    process.env.QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const email = accountDeletionEmailConfiguration();
  const checks = {
    workerMode: process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE === "true",
    executorEnabled:
      process.env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED === "true",
    databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    firebaseProjectConfigured: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
    storageBucketAllowlistConfigured: bucketAllowlist.length > 0,
    resendConfigured: email.apiKeyConfigured,
    senderConfigured: email.fromConfigured,
    senderValid: email.fromValid,
  };
  return NextResponse.json({
    ok: Object.values(checks).every(Boolean),
    schema: "quipsly-account-deletion-worker-readiness-v1",
    checks,
    bucketAllowlist,
    senderDomain: email.fromDomain,
    secretsPrinted: false,
  });
}

export async function POST(request: Request) {
  if (process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE !== "true") {
    return error("Account deletion worker mode is disabled.", 503);
  }
  if (!authorized(request)) {
    return error("Account deletion worker authorization failed.", 403);
  }

  const body = await request.json().catch(() => null);
  if (!isObject(body) || !isObject(body.plan)) {
    return error("Account deletion worker request is invalid.", 400);
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const plan = body.plan as unknown as AccountDeletionExecutionPlan;
  if (!requestId || plan.requestId !== requestId) {
    return error("Account deletion worker request identity is invalid.", 400);
  }

  try {
    const receipt = await executeAccountDeletion({ requestId, plan });
    return NextResponse.json({ ok: true, receipt });
  } catch (executionError) {
    const message =
      executionError instanceof Error
        ? executionError.message.slice(0, 1_000)
        : "Account deletion execution failed.";
    return error(message, 500);
  }
}
