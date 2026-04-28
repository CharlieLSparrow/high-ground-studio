export type CoachingOfferKey =
  | "single-session"
  | "monthly-1"
  | "monthly-2";

export type CoachingOffer = {
  key: CoachingOfferKey;
  title: string;
  mode: "payment" | "subscription";
  priceDisplay: string;
  stripePriceEnvVar: string;
  description: string;
};

export const coachingOffers: Record<CoachingOfferKey, CoachingOffer> = {
  "single-session": {
    key: "single-session",
    title: "Single Session",
    mode: "payment",
    priceDisplay: "$65",
    stripePriceEnvVar: "STRIPE_PRICE_SINGLE_SESSION",
    description: "One-time coaching session",
  },
  "monthly-1": {
    key: "monthly-1",
    title: "1 Session / Month",
    mode: "subscription",
    priceDisplay: "$57/month",
    stripePriceEnvVar: "STRIPE_PRICE_MONTHLY_1",
    description: "Monthly coaching subscription with one session per month",
  },
  "monthly-2": {
    key: "monthly-2",
    title: "2 Sessions / Month",
    mode: "subscription",
    priceDisplay: "$97/month",
    stripePriceEnvVar: "STRIPE_PRICE_MONTHLY_2",
    description: "Monthly coaching subscription with two sessions per month",
  },
};

export function getCoachingOffer(key: string): CoachingOffer | null {
  if (
    key === "single-session" ||
    key === "monthly-1" ||
    key === "monthly-2"
  ) {
    return coachingOffers[key];
  }

  return null;
}

export function getOfferPriceId(key: CoachingOfferKey): string | null {
  const offer = coachingOffers[key];
  const value = process.env[offer.stripePriceEnvVar];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}