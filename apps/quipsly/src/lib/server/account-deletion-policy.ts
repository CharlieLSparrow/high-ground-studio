export const ACCOUNT_DELETION_POLICY = {
  version: "2026-07-24.v2",
  targetDays: 30,
  supportEmail: "charlie@highgroundodyssey.com",
} as const;

export type AccountDeletionRequestStatus =
  | "REQUESTED"
  | "REVIEWING"
  | "EXPORT_PREPARING"
  | "READY_FOR_DELETION"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

type DeletionRequestRecord = {
  id: string;
  status: string;
  requestedAt: Date | string;
  reviewedAt?: Date | string | null;
  executionStartedAt?: Date | string | null;
  completedAt?: Date | string | null;
  failedAt?: Date | string | null;
  canceledAt?: Date | string | null;
  executionReceiptJson?: unknown;
  lastFailureJson?: unknown;
  updatedAt?: Date | string | null;
};

const STATUS_COPY: Record<
  AccountDeletionRequestStatus,
  { label: string; detail: string; nextAction: string; active: boolean }
> = {
  REQUESTED: {
    label: "Request received",
    detail: "Your request is in the review queue.",
    nextAction:
      "Quipsly will review account-owned data, shared work, payment and consent evidence, recordings, and any records that must be retained.",
    active: true,
  },
  REVIEWING: {
    label: "Review in progress",
    detail: "Quipsly is reviewing the data attached to your account.",
    nextAction:
      "No action is required unless Quipsly contacts you to verify the request or clarify export and retention choices.",
    active: true,
  },
  EXPORT_PREPARING: {
    label: "Preparing eligible data",
    detail:
      "Quipsly is preparing any requested or required account export before deletion.",
    nextAction:
      "Keep access to your account email. Quipsly will contact you if an export needs to be delivered or confirmed.",
    active: true,
  },
  READY_FOR_DELETION: {
    label: "Deletion review complete",
    detail:
      "The request has passed review and is ready for the final deletion step.",
    nextAction:
      "Quipsly will complete the approved deletion work and send confirmation to your account email.",
    active: true,
  },
  EXECUTING: {
    label: "Deletion in progress",
    detail:
      "Quipsly is revoking account access and applying the approved deletion and retention plan.",
    nextAction:
      "Keep access to your account email for the final completion confirmation. Retried work resumes from the durable execution receipt.",
    active: true,
  },
  COMPLETED: {
    label: "Deletion completed",
    detail:
      "Quipsly completed the approved account deletion work and recorded a durable executor receipt.",
    nextAction:
      "Check your account email for the completion confirmation and the disclosed categories of records that were retained or anonymized.",
    active: false,
  },
  FAILED: {
    label: "Deletion needs recovery",
    detail:
      "Quipsly could not finish every approved deletion step. Account access remains disabled while the operation is safely retried or reviewed.",
    nextAction:
      "Quipsly will resume from the durable execution record. Contact support if you need an update before the retry completes.",
    active: true,
  },
  CANCELED: {
    label: "Request canceled",
    detail: "This account deletion request was canceled.",
    nextAction:
      "You can submit a new request in the app or contact Quipsly support if this was unexpected.",
    active: false,
  },
  REJECTED: {
    label: "Request needs follow-up",
    detail: "Quipsly could not complete this request as submitted.",
    nextAction:
      "Contact Quipsly support for the specific reason and the available next step.",
    active: false,
  },
};

function date(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function recognizedStatus(value: string): AccountDeletionRequestStatus {
  return value in STATUS_COPY
    ? (value as AccountDeletionRequestStatus)
    : "REQUESTED";
}

export function accountDeletionTargetAt(requestedAt: Date | string) {
  const requested = date(requestedAt);
  if (!requested)
    throw new Error(
      "Account deletion request has an invalid requestedAt value.",
    );
  return new Date(
    requested.getTime() +
      ACCOUNT_DELETION_POLICY.targetDays * 24 * 60 * 60 * 1_000,
  );
}

export function projectAccountDeletionRequest(record: DeletionRequestRecord) {
  const status = recognizedStatus(record.status);
  const copy = STATUS_COPY[status];

  return {
    id: record.id,
    status,
    statusLabel: copy.label,
    statusDetail: copy.detail,
    requestedAt: date(record.requestedAt),
    targetCompletionAt: accountDeletionTargetAt(record.requestedAt),
    reviewedAt: date(record.reviewedAt),
    executionStartedAt: date(record.executionStartedAt),
    completedAt: date(record.completedAt),
    failedAt: date(record.failedAt),
    canceledAt: date(record.canceledAt),
    updatedAt: date(record.updatedAt),
    completionReceiptAvailable:
      status === "COMPLETED" &&
      typeof record.executionReceiptJson === "object" &&
      record.executionReceiptJson !== null,
    recoveryRequired: status === "FAILED",
    active: copy.active,
    nextAction: copy.nextAction,
  };
}

export function accountDeletionPolicyResponse() {
  return {
    version: ACCOUNT_DELETION_POLICY.version,
    targetDays: ACCOUNT_DELETION_POLICY.targetDays,
    supportEmail: ACCOUNT_DELETION_POLICY.supportEmail,
    timing:
      "Quipsly targets completion within 30 days. If legal retention or unusually complex attached records require more time, Quipsly will explain the delay.",
    completionConfirmation:
      "Quipsly provides completion confirmation through the request status and the account email.",
  };
}
