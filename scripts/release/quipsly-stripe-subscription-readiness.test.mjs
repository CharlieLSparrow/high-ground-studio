import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REQUIRED_STRIPE_EVENTS,
  parseArguments,
  summarizeStripeReadiness,
} from "./quipsly-stripe-subscription-readiness.mjs";

const options = parseArguments([]);

function fixture() {
  const environment = {
    STRIPE_SECRET_KEY: "sk_live_redacted",
    STRIPE_SAAS_WEBHOOK_SECRET: "whsec_redacted",
    QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID: "price_monthly",
    QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID: "price_annual",
  };
  const price = ({ id, unitAmount, interval }) => ({
    id,
    active: true,
    livemode: true,
    currency: "usd",
    unit_amount: unitAmount,
    type: "recurring",
    recurring: { interval, interval_count: 1 },
    product: { id: `prod_${interval}`, active: true, name: `Quipsly ${interval}` },
  });
  return {
    options,
    environment,
    accountDocument: {
      id: "acct_quipsly",
      country: "US",
      default_currency: "usd",
      livemode: true,
      charges_enabled: true,
      payouts_enabled: true,
    },
    monthlyPriceDocument: price({ id: "price_monthly", unitAmount: 2_999, interval: "month" }),
    annualPriceDocument: price({ id: "price_annual", unitAmount: 29_999, interval: "year" }),
    webhookEndpointsDocument: { data: [{
      id: "we_quipsly",
      url: options.webhookUrl,
      status: "enabled",
      livemode: true,
      enabled_events: [...REQUIRED_STRIPE_EVENTS],
    }] },
    auditedAt: "2026-08-27T12:00:00.000Z",
  };
}

test("accepts the exact live paid-coaching provider configuration", () => {
  const receipt = summarizeStripeReadiness(fixture());
  assert.equal(receipt.ready, true);
  assert.deepEqual(receipt.blockers, []);
  assert.equal(receipt.prices.monthly.unitAmount, 2_999);
  assert.equal(receipt.prices.annual.unitAmount, 29_999);
  assert.equal(receipt.webhook.matchedEndpointId, "we_quipsly");
});

test("fails closed on price, mode, and webhook drift", () => {
  const input = fixture();
  input.monthlyPriceDocument.unit_amount = 999;
  input.annualPriceDocument.active = false;
  input.webhookEndpointsDocument.data[0].enabled_events = ["checkout.session.completed"];
  input.environment.STRIPE_SECRET_KEY = "sk_test_wrong_mode";
  const receipt = summarizeStripeReadiness(input);
  assert.equal(receipt.ready, false);
  assert.deepEqual(receipt.blockers.map(({ code }) => code), [
    "stripe-account-mode-mismatch",
    "stripe-monthly-price-mismatch",
    "stripe-annual-price-mismatch",
    "stripe-webhook-missing",
  ]);
});

test("requires the webhook signing secret without exposing any secret", () => {
  const input = fixture();
  input.environment.STRIPE_SAAS_WEBHOOK_SECRET = "";
  const receipt = summarizeStripeReadiness(input);
  assert.equal(receipt.ready, false);
  assert.equal(receipt.credentials.webhookSecretConfigured, false);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /sk_live_redacted|whsec_redacted/);
  assert.equal(receipt.sensitiveFieldsPrinted, false);
});

test("CLI is read-only and validates exact modes and HTTPS endpoints", () => {
  assert.equal(parseArguments([]).expectedMode, "live");
  assert.throws(() => parseArguments(["--apply"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--expected-mode", "production"]), /live or test/);
  assert.throws(() => parseArguments(["--webhook-url", "http:\/\/nest.quipsly.com/hook"]), /HTTPS/);
  const source = readFileSync("scripts/release/quipsly-stripe-subscription-readiness.mjs", "utf8");
  assert.doesNotMatch(source, /fetch\([^\n]+method:\s*["']POST/);
  assert.doesNotMatch(source, /console\.log\(.*secret/i);
});
