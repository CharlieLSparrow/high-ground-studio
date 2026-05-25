export const WORLDHUB_DOMAIN_VERSION = "worldhub-domain-v0";

export type WorldHubId = string;
export type WorldHubIsoDate = string;

export type WorldHubRecordStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";

export type WorldHubSiteKind =
  | "public_site"
  | "private_app"
  | "admin_surface"
  | "embed_host"
  | "future_site";

export type WorldHubEmbedKind =
  | "offer_card"
  | "access_gate"
  | "coaching_entry"
  | "supporter_entry"
  | "merch_entry"
  | "custom";

export type WorldHubOfferKind =
  | "coaching"
  | "membership"
  | "subscription"
  | "merch"
  | "supporter"
  | "bundle"
  | "custom";

export type WorldHubProductKind =
  | "coaching_program"
  | "coaching_package"
  | "membership"
  | "digital_access"
  | "physical_merch"
  | "supporter_tier"
  | "bundle"
  | "custom";

export type WorldHubPriceCadence =
  | "one_time"
  | "monthly"
  | "quarterly"
  | "annual"
  | "pay_what_you_can"
  | "custom";

export type WorldHubOrderStatus =
  | "draft"
  | "pending"
  | "placed"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "canceled"
  | "failed";

export type WorldHubSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired";

export type WorldHubEntitlementKind =
  | "content_access"
  | "coaching_access"
  | "course_access"
  | "studio_access"
  | "supporter_access"
  | "merch_benefit"
  | "custom";

export type WorldHubEntitlementGrantStatus =
  | "pending"
  | "active"
  | "suspended"
  | "revoked"
  | "expired";

export type WorldHubProviderKind =
  | "payment"
  | "supporter"
  | "storefront"
  | "fulfillment"
  | "email"
  | "calendar"
  | "analytics"
  | "search"
  | "advertising"
  | "affiliate"
  | "custom";

export type WorldHubProviderConnectionStatus =
  | "planned"
  | "configured"
  | "active"
  | "paused"
  | "disabled"
  | "error";

export type WorldHubProviderEventVerificationStatus =
  | "not_required"
  | "unchecked"
  | "verified"
  | "failed";

export type WorldHubProviderEventProcessingStatus =
  | "received"
  | "ignored"
  | "queued"
  | "processed"
  | "failed"
  | "replayed";

export type WorldHubFulfillmentJobStatus =
  | "queued"
  | "ready"
  | "sent_to_provider"
  | "in_progress"
  | "completed"
  | "failed"
  | "canceled";

export type WorldHubCoachingSessionStatus =
  | "requested"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show";

export type WorldHubMetadata = Record<string, string | number | boolean | null>;

export type WorldHubExternalRef = {
  providerConnectionId?: WorldHubId;
  providerKind: WorldHubProviderKind;
  externalId: string;
  externalType?: string;
};

export type WorldHubMoney = {
  amountCents?: number;
  currency?: string;
  payWhatYouCan?: boolean;
};

export interface WorldHubSite {
  id: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubSiteKind;
  status: WorldHubRecordStatus;
  canonicalUrl?: string;
  description?: string;
  createdAt?: WorldHubIsoDate;
  updatedAt?: WorldHubIsoDate;
  metadata?: WorldHubMetadata;
}

export interface WorldHubEmbed {
  id: WorldHubId;
  siteId: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubEmbedKind;
  status: WorldHubRecordStatus;
  offerIds?: WorldHubId[];
  entitlementIds?: WorldHubId[];
  createdAt?: WorldHubIsoDate;
  updatedAt?: WorldHubIsoDate;
  metadata?: WorldHubMetadata;
}

export interface WorldHubOffer {
  id: WorldHubId;
  siteId?: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubOfferKind;
  status: WorldHubRecordStatus;
  productIds: WorldHubId[];
  priceIds: WorldHubId[];
  entitlementIds?: WorldHubId[];
  summary?: string;
  startsAt?: WorldHubIsoDate;
  endsAt?: WorldHubIsoDate;
  metadata?: WorldHubMetadata;
}

export interface WorldHubProduct {
  id: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubProductKind;
  status: WorldHubRecordStatus;
  description?: string;
  entitlementIds?: WorldHubId[];
  fulfillmentRequired?: boolean;
  metadata?: WorldHubMetadata;
}

export interface WorldHubPrice {
  id: WorldHubId;
  productId: WorldHubId;
  slug: string;
  name: string;
  cadence: WorldHubPriceCadence;
  status: WorldHubRecordStatus;
  money: WorldHubMoney;
  trialDays?: number;
  startsAt?: WorldHubIsoDate;
  endsAt?: WorldHubIsoDate;
  externalRefs?: WorldHubExternalRef[];
  metadata?: WorldHubMetadata;
}

export type WorldHubOrderLineItem = {
  id: WorldHubId;
  productId: WorldHubId;
  priceId?: WorldHubId;
  quantity: number;
  description?: string;
  subtotal?: WorldHubMoney;
  fulfillmentRequired?: boolean;
};

export interface WorldHubOrder {
  id: WorldHubId;
  personId?: WorldHubId;
  siteId?: WorldHubId;
  offerId?: WorldHubId;
  status: WorldHubOrderStatus;
  lineItems: WorldHubOrderLineItem[];
  total?: WorldHubMoney;
  placedAt?: WorldHubIsoDate;
  externalRefs?: WorldHubExternalRef[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubSubscription {
  id: WorldHubId;
  personId: WorldHubId;
  productId: WorldHubId;
  priceId?: WorldHubId;
  status: WorldHubSubscriptionStatus;
  currentPeriodStart?: WorldHubIsoDate;
  currentPeriodEnd?: WorldHubIsoDate;
  canceledAt?: WorldHubIsoDate;
  externalRefs?: WorldHubExternalRef[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubEntitlement {
  id: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubEntitlementKind;
  status: WorldHubRecordStatus;
  description?: string;
  siteIds?: WorldHubId[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubEntitlementGrant {
  id: WorldHubId;
  entitlementId: WorldHubId;
  personId?: WorldHubId;
  orderId?: WorldHubId;
  subscriptionId?: WorldHubId;
  source: "manual" | "order" | "subscription" | "provider_event" | "import";
  status: WorldHubEntitlementGrantStatus;
  startsAt?: WorldHubIsoDate;
  endsAt?: WorldHubIsoDate;
  grantedByPersonId?: WorldHubId;
  providerEventId?: WorldHubId;
  metadata?: WorldHubMetadata;
}

export interface WorldHubProviderConnection {
  id: WorldHubId;
  slug: string;
  name: string;
  kind: WorldHubProviderKind;
  status: WorldHubProviderConnectionStatus;
  accountLabel?: string;
  siteIds?: WorldHubId[];
  lastCheckedAt?: WorldHubIsoDate;
  metadata?: WorldHubMetadata;
}

export interface WorldHubProviderEvent {
  id: WorldHubId;
  providerConnectionId: WorldHubId;
  providerKind: WorldHubProviderKind;
  eventType: string;
  providerEventId?: string;
  idempotencyKey?: string;
  verificationStatus: WorldHubProviderEventVerificationStatus;
  processingStatus: WorldHubProviderEventProcessingStatus;
  receivedAt: WorldHubIsoDate;
  occurredAt?: WorldHubIsoDate;
  payloadHash?: string;
  payloadRef?: string;
  relatedOrderId?: WorldHubId;
  relatedSubscriptionId?: WorldHubId;
  relatedEntitlementGrantId?: WorldHubId;
  errorMessage?: string;
  metadata?: WorldHubMetadata;
}

export type WorldHubFulfillmentLine = {
  id: WorldHubId;
  orderLineItemId?: WorldHubId;
  productId: WorldHubId;
  quantity: number;
  description?: string;
};

export interface WorldHubFulfillmentJob {
  id: WorldHubId;
  orderId: WorldHubId;
  providerConnectionId?: WorldHubId;
  status: WorldHubFulfillmentJobStatus;
  lines: WorldHubFulfillmentLine[];
  queuedAt?: WorldHubIsoDate;
  sentAt?: WorldHubIsoDate;
  completedAt?: WorldHubIsoDate;
  failureReason?: string;
  externalRefs?: WorldHubExternalRef[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubCoachingProgram {
  id: WorldHubId;
  slug: string;
  name: string;
  status: WorldHubRecordStatus;
  description?: string;
  siteIds?: WorldHubId[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubCoachingPackage {
  id: WorldHubId;
  programId: WorldHubId;
  productId?: WorldHubId;
  slug: string;
  name: string;
  status: WorldHubRecordStatus;
  sessionCount?: number;
  sessionDurationMinutes?: number;
  entitlementIds?: WorldHubId[];
  metadata?: WorldHubMetadata;
}

export interface WorldHubCoachingSession {
  id: WorldHubId;
  programId?: WorldHubId;
  packageId?: WorldHubId;
  entitlementGrantId?: WorldHubId;
  personId?: WorldHubId;
  coachPersonId?: WorldHubId;
  status: WorldHubCoachingSessionStatus;
  scheduledStart?: WorldHubIsoDate;
  scheduledEnd?: WorldHubIsoDate;
  timezone?: string;
  locationType?: "video" | "phone" | "in_person" | "other";
  sourceRequestId?: WorldHubId;
  metadata?: WorldHubMetadata;
}
