import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorldHubProviderReadiness,
  WORLDHUB_PROVIDER_DEFINITIONS,
} from "../apps/web/src/lib/worldhub/provider-definitions.ts";

test("defines the first revenue and scheduling provider lanes", () => {
  const providerKeys = WORLDHUB_PROVIDER_DEFINITIONS.map(
    (definition) => definition.providerKey,
  );

  assert.deepEqual(providerKeys, [
    "stripe",
    "patreon",
    "google-calendar",
    "merch-storefront",
    "google-analytics",
    "google-search-console",
    "google-adsense",
    "affiliate-links",
    "direct-sponsors",
    "merch-fulfillment",
    "resend",
    "app-cart",
  ]);
});

test("tracks analytics, search, ads, and affiliate provider readiness", () => {
  const analytics = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "google-analytics",
  );
  const searchConsole = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "google-search-console",
  );
  const adsense = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "google-adsense",
  );
  const affiliates = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "affiliate-links",
  );

  assert.ok(analytics);
  assert.ok(searchConsole);
  assert.ok(adsense);
  assert.ok(affiliates);

  assert.equal(
    getWorldHubProviderReadiness(analytics, {
      HGO_GA_MEASUREMENT_ID: "G-TEST123",
    }).status,
    "configured",
  );
  assert.equal(
    getWorldHubProviderReadiness(searchConsole, {
      GOOGLE_SEARCH_CONSOLE_SITE_URL: "https://app.highgroundodyssey.com/",
    }).status,
    "configured",
  );
  assert.equal(
    getWorldHubProviderReadiness(adsense, {
      GOOGLE_ADSENSE_CLIENT: "ca-pub-1234567890123456",
    }).status,
    "configured",
  );
  assert.equal(getWorldHubProviderReadiness(affiliates, {}).status, "configured");
});

test("marks app cart configured without external secrets", () => {
  const definition = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "app-cart",
  );

  assert.ok(definition);

  const readiness = getWorldHubProviderReadiness(definition, {});

  assert.equal(readiness.status, "configured");
  assert.deepEqual(readiness.missingEnv, []);
});

test("requires independent calendar auth instead of reusing sign-in OAuth", () => {
  const definition = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "google-calendar",
  );

  assert.ok(definition);

  const readiness = getWorldHubProviderReadiness(definition, {
    GOOGLE_CLIENT_ID: "sign-in-client",
    GOOGLE_CLIENT_SECRET: "sign-in-secret",
    GOOGLE_CALENDAR_ID: "calendar@example.test",
  });

  assert.equal(readiness.status, "planned");
  assert.deepEqual(readiness.configuredEnv, ["GOOGLE_CALENDAR_ID"]);
  assert.deepEqual(readiness.missingEnv, [
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
    "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
  ]);
});

test("accepts either service account or refresh token calendar auth", () => {
  const definition = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "google-calendar",
  );

  assert.ok(definition);

  const serviceAccountReadiness = getWorldHubProviderReadiness(definition, {
    GOOGLE_CALENDAR_ID: "calendar@example.test",
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: "{}",
  });
  const refreshTokenReadiness = getWorldHubProviderReadiness(definition, {
    GOOGLE_CALENDAR_ID: "calendar@example.test",
    GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
  });

  assert.equal(serviceAccountReadiness.status, "configured");
  assert.equal(refreshTokenReadiness.status, "configured");
});

test("tracks merch storefront provider selection and provider key separately", () => {
  const definition = WORLDHUB_PROVIDER_DEFINITIONS.find(
    (item) => item.providerKey === "merch-storefront",
  );

  assert.ok(definition);

  const readiness = getWorldHubProviderReadiness(definition, {
    HGO_MERCH_PROVIDER: "shopify",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "token",
    SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
  });

  assert.equal(readiness.status, "configured");
  assert.deepEqual(readiness.missingEnv, []);
  assert.deepEqual(readiness.configuredEnv, [
    "HGO_MERCH_PROVIDER",
    "SHOPIFY_ADMIN_ACCESS_TOKEN",
    "SHOPIFY_STORE_DOMAIN",
  ]);
});
