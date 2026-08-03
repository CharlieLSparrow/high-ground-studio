import "server-only";

import { createHash } from "node:crypto";

export const WEEKLY_COMMITMENT_RECEIPT_KIND =
  "quipsly-weekly-commitment-save-v2";

type WeeklyCommitmentClient = any;

export type WeeklyCommitmentIntent = {
  clientUserId: string;
  weekStartsAt: Date;
  commitments: [string, string?, string?];
  supportNeeded: string | null;
  progressNotes: string | null;
  clientReviewed: boolean;
  expectedUpdatedAt: Date | null;
  clientRequestId: string;
  receiptId: string;
  surface: string;
  now: Date;
};

export type WeeklyCommitmentMutationResult =
  | {
      kind: "saved";
      commitment: { id: string; updatedAt: Date };
      receiptId: string;
      clientRequestId: string;
      idempotentReplay: boolean;
      intentSha256: string;
    }
  | { kind: "not-found" }
  | { kind: "conflict" }
  | { kind: "identity-conflict" };

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function clean(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export function parseWeeklyCommitmentWeekStart(
  value: unknown,
  now = new Date(),
) {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.getUTCDay() !== 1
    || date.toISOString().slice(0, 10) !== text
    || Math.abs(date.getTime() - now.getTime()) > 400 * 86_400_000
  ) return null;
  return date;
}

export function normalizeWeeklyCommitmentIntent(input: {
  commitmentOne: unknown;
  commitmentTwo?: unknown;
  commitmentThree?: unknown;
  supportNeeded?: unknown;
  progressNotes?: unknown;
}) {
  const one = clean(input.commitmentOne, 1_000);
  const two = clean(input.commitmentTwo, 1_000);
  const three = clean(input.commitmentThree, 1_000);
  return {
    commitments: [one, two || undefined, three || undefined] as [string, string?, string?],
    supportNeeded: clean(input.supportNeeded, 3_000) || null,
    progressNotes: clean(input.progressNotes, 5_000) || null,
  };
}

export function weeklyCommitmentIntentSha256(
  input: Pick<WeeklyCommitmentIntent,
    | "clientUserId"
    | "weekStartsAt"
    | "commitments"
    | "supportNeeded"
    | "progressNotes"
    | "clientReviewed"
  >,
) {
  return createHash("sha256").update(JSON.stringify({
    schema: "quipsly-weekly-commitment-intent-v1",
    clientUserId: input.clientUserId,
    weekStartsAt: input.weekStartsAt.toISOString(),
    commitments: input.commitments.map((item) => item || null),
    supportNeeded: input.supportNeeded,
    progressNotes: input.progressNotes,
    clientReviewed: input.clientReviewed,
  })).digest("hex");
}

export async function saveWeeklyCommitmentInTransaction(
  tx: WeeklyCommitmentClient,
  input: WeeklyCommitmentIntent,
): Promise<WeeklyCommitmentMutationResult> {
  const intentSha256 = weeklyCommitmentIntentSha256(input);
  const current = await tx.weeklyCommitment.findUnique({
    where: {
      clientUserId_weekStartsAt: {
        clientUserId: input.clientUserId,
        weekStartsAt: input.weekStartsAt,
      },
    },
    select: {
      id: true,
      status: true,
      clientReviewedAt: true,
      sourceJson: true,
      updatedAt: true,
    },
  });
  const source = object(current?.sourceJson);
  const receipts = Array.isArray(source.clientPlanReceipts)
    ? source.clientPlanReceipts.map(object)
    : [];
  const existingReceipt = receipts.find((receipt) => (
    receipt.kind === WEEKLY_COMMITMENT_RECEIPT_KIND
    && receipt.clientRequestId === input.clientRequestId
  ));
  if (existingReceipt) {
    if (
      existingReceipt.intentSha256 !== intentSha256
      || existingReceipt.receiptId !== input.receiptId
    ) return { kind: "identity-conflict" };
    if (!current) return { kind: "conflict" };
    return {
      kind: "saved",
      commitment: { id: current.id, updatedAt: current.updatedAt },
      receiptId: input.receiptId,
      clientRequestId: input.clientRequestId,
      idempotentReplay: true,
      intentSha256,
    };
  }
  if (current && current.status !== "ACTIVE") return { kind: "not-found" };
  if (
    current
      ? !input.expectedUpdatedAt
        || current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      : Boolean(input.expectedUpdatedAt)
  ) return { kind: "conflict" };

  const receipt = {
    id: input.receiptId,
    receiptId: input.receiptId,
    kind: WEEKLY_COMMITMENT_RECEIPT_KIND,
    clientRequestId: input.clientRequestId,
    intentSha256,
    savedAt: input.now.toISOString(),
    savedByUserId: input.clientUserId,
    clientReviewed: input.clientReviewed,
    surface: clean(input.surface, 120) || "unknown",
    externalSideEffects: false,
  };
  const priorReceipts = receipts.slice(-23);
  const data = {
    commitmentOne: input.commitments[0],
    commitmentTwo: input.commitments[1] || null,
    commitmentThree: input.commitments[2] || null,
    supportNeeded: input.supportNeeded,
    progressNotes: input.progressNotes,
    clientReviewedAt: input.clientReviewed
      ? input.now
      : current?.clientReviewedAt ?? null,
    sourceJson: {
      ...source,
      source: "quipsly-client-weekly-plan-v1",
      clientPlanReceipts: [...priorReceipts, receipt],
    },
  };
  if (!current) {
    const created = await tx.weeklyCommitment.create({
      data: {
        clientUserId: input.clientUserId,
        weekStartsAt: input.weekStartsAt,
        ...data,
      },
      select: { id: true, updatedAt: true },
    });
    return {
      kind: "saved",
      commitment: created,
      receiptId: input.receiptId,
      clientRequestId: input.clientRequestId,
      idempotentReplay: false,
      intentSha256,
    };
  }
  const changed = await tx.weeklyCommitment.updateMany({
    where: {
      id: current.id,
      clientUserId: input.clientUserId,
      status: "ACTIVE",
      updatedAt: input.expectedUpdatedAt!,
    },
    data,
  });
  if (changed.count !== 1) return { kind: "conflict" };
  const persisted = await tx.weeklyCommitment.findUnique({
    where: { id: current.id },
    select: { id: true, updatedAt: true },
  });
  if (!persisted) return { kind: "conflict" };
  return {
    kind: "saved",
    commitment: persisted,
    receiptId: input.receiptId,
    clientRequestId: input.clientRequestId,
    idempotentReplay: false,
    intentSha256,
  };
}
