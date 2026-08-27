export const ACCOUNT_DELETION_POLICY = {
  version: "2026-08-27.v3",
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
    label: "Deletion scheduled",
    detail: "Quipsly received your request and queued account deletion.",
    nextAction:
      "No action is required. Quipsly will begin processing automatically.",
    active: true,
  },
  REVIEWING: {
    label: "Deletion in progress",
    detail:
      "Quipsly is deleting personal data and separating or anonymizing records that other participants or legal obligations still require.",
    nextAction:
      "No action is required. Quipsly will continue automatically and show the result here.",
    active: true,
  },
  EXPORT_PREPARING: {
    label: "Preparing eligible data",
    detail:
      "Quipsly is preparing any requested or required account export before deletion.",
    nextAction: "No action is required. Quipsly will continue automatically.",
    active: true,
  },
  READY_FOR_DELETION: {
    label: "Deletion queued",
    detail:
      "Your account passed the automatic data check and is queued for secure deletion.",
    nextAction:
      "Quipsly will complete deletion automatically. Email confirmation is sent when delivery is available.",
    active: true,
  },
  EXECUTING: {
    label: "Deletion in progress",
    detail:
      "Quipsly is removing account access and applying the deletion and retention rules.",
    nextAction:
      "No action is required. Quipsly will finish automatically and record the result.",
    active: true,
  },
  COMPLETED: {
    label: "Deletion completed",
    detail: "Quipsly completed account deletion.",
    nextAction:
      "Deletion is complete. If email delivery was available, Quipsly also sent a confirmation.",
    active: false,
  },
  FAILED: {
    label: "Deletion needs attention",
    detail: "Quipsly hit a processing problem after protecting account access.",
    nextAction:
      "No action is required. Quipsly will retry safely from the last completed step and contact you if identity verification is needed.",
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
      "Quipsly records completion in the request status and also emails confirmation when delivery is available.",
  };
}
