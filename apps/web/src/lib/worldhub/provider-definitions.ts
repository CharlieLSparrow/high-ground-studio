import type {
  WorldHubProviderConnectionStatus,
  WorldHubProviderKind,
} from "@high-ground/worldhub-domain";

export type WorldHubProviderCapability =
  | "billing"
  | "checkout"
  | "cart"
  | "subscriptions"
  | "supporter_memberships"
  | "calendar_events"
  | "appointment_sync"
  | "site_analytics"
  | "search_console"
  | "seo"
  | "ads"
  | "affiliate_marketing"
  | "sponsor_slots"
  | "merch_catalog"
  | "fulfillment"
  | "email_delivery"
  | "webhooks";

export type WorldHubEnvRequirement =
  | {
      allOf: string[];
      label: string;
    }
  | {
      anyOf: string[];
      label: string;
    };

export type WorldHubProviderDefinition = {
  providerKey: string;
  providerKind: WorldHubProviderKind;
  displayName: string;
  accountLabel: string;
  capabilities: WorldHubProviderCapability[];
  requiredEnv: WorldHubEnvRequirement[];
  optionalEnv: string[];
  setupUrl?: string;
  setupNotes: string;
};

export type WorldHubProviderReadiness = {
  providerKey: string;
  status: WorldHubProviderConnectionStatus;
  configuredEnv: string[];
  missingEnv: string[];
  requiredEnv: WorldHubEnvRequirement[];
  optionalEnv: string[];
};

export const WORLDHUB_PROVIDER_DEFINITIONS: WorldHubProviderDefinition[] = [
  {
    providerKey: "stripe",
    providerKind: "payment",
    displayName: "Stripe",
    accountLabel: "Billing, checkout, donations, and subscriptions",
    capabilities: ["billing", "checkout", "cart", "subscriptions", "webhooks"],
    requiredEnv: [
      { allOf: ["STRIPE_SECRET_KEY"], label: "Server API key" },
      { allOf: ["STRIPE_WEBHOOK_SECRET"], label: "Webhook verification" },
    ],
    optionalEnv: [
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_COACHING_PRICE_ID",
      "STRIPE_SUPPORTER_PRICE_ID",
      "STRIPE_SUCCESS_URL",
      "STRIPE_CANCEL_URL",
    ],
    setupUrl: "https://dashboard.stripe.com/",
    setupNotes:
      "Use for hosted checkout, invoices, subscriptions, and payment webhooks. Set the webhook endpoint to /api/worldhub/webhooks/stripe and keep card handling inside Stripe-hosted surfaces.",
  },
  {
    providerKey: "patreon",
    providerKind: "supporter",
    displayName: "Patreon",
    accountLabel: "Supporter memberships and tier reconciliation",
    capabilities: ["supporter_memberships", "subscriptions", "webhooks"],
    requiredEnv: [
      { allOf: ["PATREON_CLIENT_ID"], label: "OAuth client id" },
      { allOf: ["PATREON_CLIENT_SECRET"], label: "OAuth client secret" },
      { allOf: ["PATREON_WEBHOOK_SECRET"], label: "Webhook verification" },
    ],
    optionalEnv: ["PATREON_CAMPAIGN_ID", "PATREON_CREATOR_ACCESS_TOKEN"],
    setupUrl: "https://www.patreon.com/portal/registration/register-clients",
    setupNotes:
      "Use for supporter identity, tier state, and member events. Set the webhook endpoint to /api/worldhub/webhooks/patreon. Patreon state should grant app entitlements, not replace app identity.",
  },
  {
    providerKey: "google-calendar",
    providerKind: "calendar",
    displayName: "Google Calendar",
    accountLabel: "Coaching appointment sync",
    capabilities: ["calendar_events", "appointment_sync"],
    requiredEnv: [
      { allOf: ["GOOGLE_CALENDAR_ID"], label: "Target calendar" },
      {
        anyOf: [
          "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
          "GOOGLE_CALENDAR_REFRESH_TOKEN",
        ],
        label: "Server-side calendar auth",
      },
    ],
    optionalEnv: [
      "GOOGLE_CALENDAR_IMPERSONATION_EMAIL",
      "GOOGLE_CALENDAR_SYNC_CLIENT_ID",
      "GOOGLE_CALENDAR_SYNC_CLIENT_SECRET",
      "GOOGLE_CALENDAR_SEND_UPDATES",
    ],
    setupUrl: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    setupNotes:
      "Use for server-created coaching appointment events. Current customer-facing calendar links remain valid fallback behavior.",
  },
  {
    providerKey: "merch-storefront",
    providerKind: "storefront",
    displayName: "Merch Storefront",
    accountLabel: "Store catalog and cart handoff",
    capabilities: ["merch_catalog", "cart", "checkout", "webhooks"],
    requiredEnv: [
      { allOf: ["HGO_MERCH_PROVIDER"], label: "Selected merch provider" },
      {
        anyOf: [
          "SHOPIFY_ADMIN_ACCESS_TOKEN",
          "FOURTHWALL_API_KEY",
          "PRINTFUL_API_KEY",
          "PRINTIFY_API_KEY",
          "GELATO_API_KEY",
        ],
        label: "At least one merch provider API key",
      },
    ],
    optionalEnv: [
      "SHOPIFY_STORE_DOMAIN",
      "FOURTHWALL_SHOP_URL",
      "PRINTFUL_STORE_ID",
      "PRINTIFY_SHOP_ID",
      "GELATO_STORE_ID",
    ],
    setupNotes:
      "Use for store catalog, merch checkout handoff, and customer-visible product availability. Fulfillment can be a separate provider connection.",
  },
  {
    providerKey: "google-analytics",
    providerKind: "analytics",
    displayName: "Google Analytics",
    accountLabel: "GA4 traffic, audience, and conversion reporting",
    capabilities: ["site_analytics"],
    requiredEnv: [
      { allOf: ["HGO_GA_MEASUREMENT_ID"], label: "Site tag measurement id" },
    ],
    optionalEnv: [
      "GOOGLE_ANALYTICS_PROPERTY_ID",
      "GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON",
      "GOOGLE_ANALYTICS_REFRESH_TOKEN",
      "GOOGLE_ANALYTICS_SYNC_CLIENT_ID",
      "GOOGLE_ANALYTICS_SYNC_CLIENT_SECRET",
    ],
    setupUrl: "https://analytics.google.com/",
    setupNotes:
      "Use for sitewide GA4 tracking and later server-side report imports. The first app step is tag readiness plus manual analytics snapshots; API report sync can follow after a property id and auth are mounted.",
  },
  {
    providerKey: "google-search-console",
    providerKind: "search",
    displayName: "Google Search Console",
    accountLabel: "Indexing, query, and SEO inspection signals",
    capabilities: ["search_console", "seo"],
    requiredEnv: [
      { allOf: ["GOOGLE_SEARCH_CONSOLE_SITE_URL"], label: "Verified site property" },
    ],
    optionalEnv: [
      "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON",
      "GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN",
      "GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_ID",
      "GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_SECRET",
    ],
    setupUrl: "https://search.google.com/search-console/about",
    setupNotes:
      "Use for Search Console page/query reporting and future URL inspection. Growth briefs stay app-owned so SEO work can begin before API sync is enabled.",
  },
  {
    providerKey: "google-adsense",
    providerKind: "advertising",
    displayName: "Google AdSense",
    accountLabel: "Display ads and ads.txt readiness",
    capabilities: ["ads"],
    requiredEnv: [
      { allOf: ["GOOGLE_ADSENSE_CLIENT"], label: "AdSense publisher client id" },
    ],
    optionalEnv: [
      "GOOGLE_ADSENSE_ADS_TXT_ACCOUNT",
      "GOOGLE_ADSENSE_ADS_TXT_AUTHORITY",
      "GOOGLE_ADSENSE_ADS_TXT_RELATIONSHIP",
      "HGO_ADSENSE_AUTO_ADS_ENABLED",
    ],
    setupUrl: "https://www.google.com/adsense/start/",
    setupNotes:
      "Use for optional display ad monetization. The app can expose ads.txt and load Auto ads only when explicit env is present; ad placements remain reviewable in the Growth workspace.",
  },
  {
    providerKey: "affiliate-links",
    providerKind: "affiliate",
    displayName: "Affiliate Links",
    accountLabel: "Book, gear, and resource affiliate tracking",
    capabilities: ["affiliate_marketing"],
    requiredEnv: [],
    optionalEnv: [
      "AMAZON_ASSOCIATES_TAG",
      "BOOKSHOP_AFFILIATE_ID",
      "HGO_AFFILIATE_DISCLOSURE_TEXT",
    ],
    setupNotes:
      "Use for app-owned affiliate placement review. Each placement should carry disclosure text near the link before any public content uses it.",
  },
  {
    providerKey: "direct-sponsors",
    providerKind: "advertising",
    displayName: "Direct Sponsors",
    accountLabel: "Sponsor reads, placements, and campaign packages",
    capabilities: ["sponsor_slots", "ads"],
    requiredEnv: [],
    optionalEnv: ["HGO_SPONSOR_INQUIRY_URL", "HGO_SPONSOR_MEDIA_KIT_URL"],
    setupNotes:
      "Use for sponsor packages and manually reviewed placements that do not belong to AdSense or affiliate programs.",
  },
  {
    providerKey: "merch-fulfillment",
    providerKind: "fulfillment",
    displayName: "Merch Fulfillment",
    accountLabel: "Print-on-demand fulfillment jobs",
    capabilities: ["fulfillment", "merch_catalog", "webhooks"],
    requiredEnv: [
      {
        anyOf: ["PRINTFUL_API_KEY", "PRINTIFY_API_KEY", "GELATO_API_KEY"],
        label: "At least one fulfillment provider API key",
      },
    ],
    optionalEnv: [
      "PRINTFUL_STORE_ID",
      "PRINTIFY_SHOP_ID",
      "GELATO_STORE_ID",
    ],
    setupNotes:
      "Use for print-on-demand fulfillment after an app-owned order or provider checkout event is reconciled.",
  },
  {
    providerKey: "resend",
    providerKind: "email",
    displayName: "Resend",
    accountLabel: "Transactional email",
    capabilities: ["email_delivery", "webhooks"],
    requiredEnv: [
      { allOf: ["RESEND_API_KEY"], label: "Server API key" },
      { allOf: ["HGO_EMAIL_FROM"], label: "Verified sender" },
    ],
    optionalEnv: ["RESEND_WEBHOOK_SECRET"],
    setupUrl: "https://resend.com/",
    setupNotes:
      "Already used for best-effort internal notifications. WorldHub can later track provider delivery events and retries.",
  },
  {
    providerKey: "app-cart",
    providerKind: "custom",
    displayName: "App Cart",
    accountLabel: "App-owned cart and order ledger",
    capabilities: ["cart", "checkout"],
    requiredEnv: [],
    optionalEnv: ["HGO_SITE_URL"],
    setupNotes:
      "No external secret required. This is the internal cart/order boundary before hosted checkout or merch fulfillment handoff.",
  },
];

function hasEnv(env: NodeJS.ProcessEnv, key: string) {
  return Boolean(env[key]?.trim());
}

function requirementIsMet(
  env: NodeJS.ProcessEnv,
  requirement: WorldHubEnvRequirement,
) {
  if ("allOf" in requirement) {
    return requirement.allOf.every((key) => hasEnv(env, key));
  }

  return requirement.anyOf.some((key) => hasEnv(env, key));
}

function missingForRequirement(
  env: NodeJS.ProcessEnv,
  requirement: WorldHubEnvRequirement,
) {
  if (requirementIsMet(env, requirement)) {
    return [];
  }

  return "allOf" in requirement ? requirement.allOf : requirement.anyOf;
}

export function getWorldHubProviderReadiness(
  definition: WorldHubProviderDefinition,
  env: NodeJS.ProcessEnv = process.env,
): WorldHubProviderReadiness {
  const missingEnv = Array.from(
    new Set(
      definition.requiredEnv.flatMap((requirement) =>
        missingForRequirement(env, requirement),
      ),
    ),
  ).sort();
  const requiredEnvNames = Array.from(
    new Set(
      definition.requiredEnv.flatMap((requirement) =>
        "allOf" in requirement ? requirement.allOf : requirement.anyOf,
      ),
    ),
  );
  const configuredEnv = [...requiredEnvNames, ...definition.optionalEnv]
    .filter((key) => hasEnv(env, key))
    .sort();

  return {
    providerKey: definition.providerKey,
    status: missingEnv.length === 0 ? "configured" : "planned",
    configuredEnv,
    missingEnv,
    requiredEnv: definition.requiredEnv,
    optionalEnv: definition.optionalEnv,
  };
}

export function getWorldHubProviderDefinition(providerKey: string) {
  return WORLDHUB_PROVIDER_DEFINITIONS.find(
    (definition) => definition.providerKey === providerKey,
  );
}
