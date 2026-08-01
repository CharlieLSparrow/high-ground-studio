import "server-only";

import { google } from "googleapis";

import type {
  AccountDeletionCompletionReceipt,
  AccountDeletionExecutionPlan,
} from "@/lib/server/account-deletion-executor";

const WORKER_PATH = "/api/internal/account-deletion/execute";
const SHARED_SECRET_HEADER = "x-quipsly-account-deletion-worker-secret";

export type AccountDeletionWorkerConfiguration = {
  enabled: boolean;
  workerOrigin: string | null;
  endpoint: string | null;
  sharedSecretConfigured: boolean;
  reason: string | null;
};

function workerUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Account deletion worker URL must use HTTPS.");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function accountDeletionWorkerConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AccountDeletionWorkerConfiguration {
  const enabledFlag =
    environment.QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED === "true";
  let origin: URL | null = null;
  try {
    origin = workerUrl(environment.QUIPSLY_ACCOUNT_DELETION_WORKER_URL);
  } catch (error) {
    return {
      enabled: false,
      workerOrigin: null,
      endpoint: null,
      sharedSecretConfigured: false,
      reason: error instanceof Error ? error.message : "Invalid worker URL.",
    };
  }
  const sharedSecret =
    environment.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET?.trim() ?? "";
  const sharedSecretConfigured = Buffer.byteLength(sharedSecret, "utf8") >= 32;
  const reason = !enabledFlag
    ? "Dedicated account deletion worker invocation is disabled."
    : !origin
      ? "Dedicated account deletion worker URL is missing."
      : !sharedSecretConfigured
        ? "Dedicated account deletion worker secret is missing or too short."
        : null;
  return {
    enabled: reason === null,
    workerOrigin: origin?.origin ?? null,
    endpoint: origin ? new URL(WORKER_PATH, origin).toString() : null,
    sharedSecretConfigured,
    reason,
  };
}

type WorkerResponse = {
  ok?: boolean;
  receipt?: AccountDeletionCompletionReceipt;
  error?: string;
};

export async function invokeAccountDeletionWorker(input: {
  requestId: string;
  plan: AccountDeletionExecutionPlan;
}): Promise<AccountDeletionCompletionReceipt> {
  const configuration = accountDeletionWorkerConfiguration();
  if (
    !configuration.enabled ||
    !configuration.workerOrigin ||
    !configuration.endpoint
  ) {
    throw new Error(
      configuration.reason ?? "Dedicated account deletion worker is unavailable.",
    );
  }
  const sharedSecret =
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET!.trim();
  const auth = new google.auth.GoogleAuth();
  const identityClient = await auth.getIdTokenClient(
    configuration.workerOrigin,
  );
  const identityHeaders = await identityClient.getRequestHeaders();
  const response = await fetch(configuration.endpoint, {
    method: "POST",
    headers: {
      ...Object.fromEntries(identityHeaders.entries()),
      "content-type": "application/json",
      [SHARED_SECRET_HEADER]: sharedSecret,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15 * 60 * 1_000),
  });
  const payload = (await response.json().catch(() => ({}))) as WorkerResponse;
  if (!response.ok || payload.ok !== true || !payload.receipt) {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error.slice(0, 1_000)
        : `Account deletion worker returned HTTP ${response.status}.`,
    );
  }
  if (
    payload.receipt.outcome !== "completed" ||
    payload.receipt.requestId !== input.requestId
  ) {
    throw new Error("Account deletion worker returned a mismatched receipt.");
  }
  return payload.receipt;
}

export const ACCOUNT_DELETION_WORKER_SECRET_HEADER = SHARED_SECRET_HEADER;
