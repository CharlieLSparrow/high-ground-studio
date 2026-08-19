export function coachingSetupPaymentPolicy(defaultAmountCents: number | null) {
  return typeof defaultAmountCents === "number" && defaultAmountCents > 0
    ? "PAID_ONE_TO_ONE" as const
    : "MANUAL" as const;
}
