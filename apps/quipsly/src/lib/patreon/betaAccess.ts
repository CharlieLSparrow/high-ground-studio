export const QUIPSLY_BETA_PATREON_PLAN_SLUG = "quipsly-beta-patreon";

const DISQUALIFYING_CHARGE_STATUSES = new Set([
  "Declined",
  "Deleted",
  "Fraud",
  "Refunded",
]);

export type PatreonBetaAccessInput = {
  patronStatus?: string | null;
  lastChargeStatus?: string | null;
  currentlyEntitledAmountCents?: number | null;
  willPayAmountCents?: number | null;
  tierIds?: string[];
};

export type PatreonBetaAccessDecision = {
  eligible: boolean;
  status: "ACTIVE" | "PENDING" | "EXPIRED" | "MANUAL_REVIEW";
  reasonCode: string;
  reasonMessage: string;
};

function positiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function evaluatePatreonBetaAccess(
  input: PatreonBetaAccessInput
): PatreonBetaAccessDecision {
  const patronStatus = input.patronStatus ?? null;
  const lastChargeStatus = input.lastChargeStatus ?? null;
  const tierIds = input.tierIds ?? [];

  if (lastChargeStatus && DISQUALIFYING_CHARGE_STATUSES.has(lastChargeStatus)) {
    return {
      eligible: false,
      status: "EXPIRED",
      reasonCode: "DISQUALIFYING_CHARGE_STATUS",
      reasonMessage: `Patreon charge status is ${lastChargeStatus}.`,
    };
  }

  if (patronStatus === "declined_patron" || patronStatus === "former_patron") {
    return {
      eligible: false,
      status: "EXPIRED",
      reasonCode: "INACTIVE_PATREON_STATUS",
      reasonMessage: `Patreon membership status is ${patronStatus}.`,
    };
  }

  if (patronStatus !== "active_patron") {
    return {
      eligible: false,
      status: "PENDING",
      reasonCode: "PENDING_OR_UNKNOWN_PATREON_STATUS",
      reasonMessage: "Patreon membership is not yet confirmed active.",
    };
  }

  const hasPaidEvidence =
    positiveAmount(input.currentlyEntitledAmountCents) ||
    positiveAmount(input.willPayAmountCents) ||
    lastChargeStatus === "Paid" ||
    tierIds.length > 0;

  if (!hasPaidEvidence) {
    return {
      eligible: false,
      status: "MANUAL_REVIEW",
      reasonCode: "NO_PAID_TIER_EVIDENCE",
      reasonMessage:
        "Patreon membership is active, but the payload did not include paid entitlement evidence.",
    };
  }

  return {
    eligible: true,
    status: "ACTIVE",
    reasonCode: "ACTIVE_PAID_PATREON",
    reasonMessage: "Active paid Patreon supporter qualifies for Quipsly beta.",
  };
}
