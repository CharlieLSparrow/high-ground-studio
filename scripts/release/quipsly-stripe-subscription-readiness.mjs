#!/usr/bin/env node

import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STRIPE_API_ORIGIN = "https://api.stripe.com";
const DEFAULT_WEBHOOK_URL = "https://nest.quipsly.com/api/billing/stripe/webhook";

export const REQUIRED_STRIPE_EVENTS = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const EXPECTED_PRICES = Object.freeze({
  monthly: { unitAmount: 2_999, currency: "usd", interval: "month", intervalCount: 1 },
  annual: { unitAmount: 29_999, currency: "usd", interval: "year", intervalCount: 1 },
});

function fail(message) {
  throw new Error(message);
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    expectedMode: "live",
    webhookUrl: DEFAULT_WEBHOOK_URL,
    outputPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--expected-mode": options.expectedMode = requiredValue(argv, index, argument); index += 1; break;
      case "--webhook-url": options.webhookUrl = requiredValue(argv, index, argument); index += 1; break;
      case "--output": options.outputPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  if (!new Set(["live", "test"]).has(options.expectedMode)) {
    fail("--expected-mode must be live or test.");
  }
  const webhookUrl = new URL(options.webhookUrl);
  if (webhookUrl.protocol !== "https:" || webhookUrl.username || webhookUrl.password) {
    fail("--webhook-url must be an HTTPS URL without embedded credentials.");
  }
  return options;
}

function usage() {
  return `Usage:
  STRIPE_SECRET_KEY=... \\
  STRIPE_SAAS_WEBHOOK_SECRET=... \\
  QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID=... \\
  QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID=... \\
    node scripts/release/quipsly-stripe-subscription-readiness.mjs [options]

Read-only options:
  --expected-mode <live|test>  Expected Stripe account mode. Default: live.
  --webhook-url <https-url>    Exact subscription webhook URL.
  --output <path>              Write a redacted mode-0600 JSON receipt.

This operator only reads Stripe account, price, product, and webhook metadata.
It never prints secrets, creates Checkout sessions, or mutates Stripe.
`;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function expectedLivemode(mode) {
  return mode === "live";
}

function priceSummary(price) {
  return {
    id: text(price?.id) || null,
    active: price?.active === true,
    livemode: price?.livemode === true,
    currency: text(price?.currency).toLowerCase() || null,
    unitAmount: Number.isInteger(price?.unit_amount) ? price.unit_amount : null,
    type: text(price?.type) || null,
    interval: text(price?.recurring?.interval) || null,
    intervalCount: Number.isInteger(price?.recurring?.interval_count)
      ? price.recurring.interval_count
      : null,
    product: {
      id: text(price?.product?.id) || (typeof price?.product === "string" ? price.product : null),
      active: price?.product?.active === true,
      name: text(price?.product?.name) || null,
    },
  };
}

function priceMatches(actual, expected, priceId, livemode) {
  return actual.id === priceId
    && actual.active
    && actual.livemode === livemode
    && actual.currency === expected.currency
    && actual.unitAmount === expected.unitAmount
    && actual.type === "recurring"
    && actual.interval === expected.interval
    && actual.intervalCount === expected.intervalCount
    && Boolean(actual.product.id)
    && actual.product.active;
}

function webhookSupports(endpoint, requiredEvents) {
  const enabled = new Set(endpoint?.enabled_events || []);
  return enabled.has("*") || requiredEvents.every((event) => enabled.has(event));
}

export function summarizeStripeReadiness({
  options,
  environment,
  accountDocument,
  monthlyPriceDocument,
  annualPriceDocument,
  webhookEndpointsDocument,
  auditedAt = new Date().toISOString(),
}) {
  const livemode = expectedLivemode(options.expectedMode);
  const secretKey = text(environment.STRIPE_SECRET_KEY);
  const webhookSecretConfigured = Boolean(text(environment.STRIPE_SAAS_WEBHOOK_SECRET));
  const monthlyPriceId = text(environment.QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID);
  const annualPriceId = text(environment.QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID);
  const credentials = {
    secretKeyConfigured: Boolean(secretKey),
    secretKeyModeMatches: livemode ? secretKey.startsWith("sk_live_") : secretKey.startsWith("sk_test_"),
    webhookSecretConfigured,
    monthlyPriceIdConfigured: Boolean(monthlyPriceId),
    annualPriceIdConfigured: Boolean(annualPriceId),
  };

  const monthly = priceSummary(monthlyPriceDocument);
  const annual = priceSummary(annualPriceDocument);
  const endpoints = (webhookEndpointsDocument?.data || []).map((endpoint) => ({
    id: text(endpoint.id) || null,
    url: text(endpoint.url) || null,
    status: text(endpoint.status) || null,
    livemode: endpoint.livemode === true,
    enabledEvents: Array.isArray(endpoint.enabled_events)
      ? [...endpoint.enabled_events].sort()
      : [],
  }));
  const webhook = endpoints.find((endpoint) =>
    endpoint.url === options.webhookUrl
      && endpoint.status === "enabled"
      && endpoint.livemode === livemode
      && webhookSupports({ enabled_events: endpoint.enabledEvents }, REQUIRED_STRIPE_EVENTS));

  const checks = {
    credentialsConfigured: credentials.secretKeyConfigured
      && credentials.webhookSecretConfigured
      && credentials.monthlyPriceIdConfigured
      && credentials.annualPriceIdConfigured,
    accountMode: credentials.secretKeyModeMatches
      && monthly.livemode === livemode
      && annual.livemode === livemode,
    accountChargesEnabled: accountDocument?.charges_enabled === true,
    accountPayoutsEnabled: accountDocument?.payouts_enabled === true,
    monthlyPrice: priceMatches(monthly, EXPECTED_PRICES.monthly, monthlyPriceId, livemode),
    annualPrice: priceMatches(annual, EXPECTED_PRICES.annual, annualPriceId, livemode),
    webhookEndpoint: Boolean(webhook),
  };
  const blockers = [];
  if (!checks.credentialsConfigured) blockers.push({ code: "stripe-secrets-incomplete", message: "Stripe launch secrets and both exact price IDs must be configured." });
  if (!checks.accountMode) blockers.push({ code: "stripe-account-mode-mismatch", message: `Stripe credentials must resolve to the ${options.expectedMode} account.` });
  if (!checks.accountChargesEnabled) blockers.push({ code: "stripe-charges-disabled", message: "Stripe reports that charges are not enabled." });
  if (!checks.accountPayoutsEnabled) blockers.push({ code: "stripe-payouts-disabled", message: "Stripe reports that payouts are not enabled." });
  if (!checks.monthlyPrice) blockers.push({ code: "stripe-monthly-price-mismatch", message: "The monthly price must be active recurring USD $29.99 in the expected mode." });
  if (!checks.annualPrice) blockers.push({ code: "stripe-annual-price-mismatch", message: "The annual price must be active recurring USD $299.99 in the expected mode." });
  if (!checks.webhookEndpoint) blockers.push({ code: "stripe-webhook-missing", message: "The exact enabled Quipsly subscription webhook must receive the required checkout, subscription, and invoice events." });

  return {
    schema: "quipsly-stripe-subscription-readiness-v1",
    auditedAt,
    mode: "read-only",
    expectedMode: options.expectedMode,
    account: {
      id: text(accountDocument?.id) || null,
      country: text(accountDocument?.country) || null,
      defaultCurrency: text(accountDocument?.default_currency) || null,
      chargesEnabled: accountDocument?.charges_enabled === true,
      payoutsEnabled: accountDocument?.payouts_enabled === true,
    },
    credentials,
    prices: { monthly, annual },
    webhook: {
      expectedUrl: options.webhookUrl,
      requiredEvents: [...REQUIRED_STRIPE_EVENTS],
      matchedEndpointId: webhook?.id || null,
      candidateCount: endpoints.length,
    },
    checks,
    ready: Object.values(checks).every(Boolean),
    blockers,
    externalMutation: false,
    sensitiveFieldsPrinted: false,
  };
}

async function stripeGet(secretKey, requestPath, search = []) {
  const url = new URL(requestPath, STRIPE_API_ORIGIN);
  for (const [key, value] of search) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const document = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(text(document?.error?.message) || `Stripe returned HTTP ${response.status}.`);
  }
  return document;
}

async function discover(environment) {
  const secretKey = text(environment.STRIPE_SECRET_KEY);
  const monthlyPriceId = text(environment.QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID);
  const annualPriceId = text(environment.QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID);
  if (!secretKey || !monthlyPriceId || !annualPriceId) {
    fail("STRIPE_SECRET_KEY and both Quipsly Stripe price IDs are required.");
  }
  const expandProduct = [["expand[]", "product"]];
  const [accountDocument, monthlyPriceDocument, annualPriceDocument, webhookEndpointsDocument] = await Promise.all([
    stripeGet(secretKey, "/v1/account"),
    stripeGet(secretKey, `/v1/prices/${encodeURIComponent(monthlyPriceId)}`, expandProduct),
    stripeGet(secretKey, `/v1/prices/${encodeURIComponent(annualPriceId)}`, expandProduct),
    stripeGet(secretKey, "/v1/webhook_endpoints", [["limit", "100"]]),
  ]);
  return { accountDocument, monthlyPriceDocument, annualPriceDocument, webhookEndpointsDocument };
}

async function writeReceipt(outputPath, receipt) {
  if (!outputPath) return;
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

export async function run(options, environment = process.env) {
  const documents = await discover(environment);
  const receipt = summarizeStripeReadiness({ options, environment, ...documents });
  await writeReceipt(options.outputPath, receipt);
  return receipt;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const receipt = await run(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ready) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
