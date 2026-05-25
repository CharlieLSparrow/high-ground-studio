import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  verifyPatreonWebhookSignature,
  verifyStripeWebhookSignature,
} from "../apps/web/src/lib/worldhub/webhook-signatures.ts";

test("verifies Stripe webhook signatures from raw body text", () => {
  const payload = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
  const secret = "whsec_test";
  const timestamp = 1_700_000_000;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const result = verifyStripeWebhookSignature({
    payload,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    endpointSecret: secret,
    nowMs: timestamp * 1000,
  });

  assert.deepEqual(result, { ok: true });
});

test("rejects stale Stripe webhook signatures", () => {
  const payload = "{}";
  const secret = "whsec_test";
  const timestamp = 1_700_000_000;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const result = verifyStripeWebhookSignature({
    payload,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    endpointSecret: secret,
    nowMs: (timestamp + 301) * 1000,
  });

  assert.equal(result.ok, false);
});

test("verifies Patreon HMAC-MD5 webhook signatures", () => {
  const payload = JSON.stringify({ data: { id: "member_123", type: "member" } });
  const secret = "patreon-secret";
  const signature = createHmac("md5", secret).update(payload, "utf8").digest("hex");

  const result = verifyPatreonWebhookSignature({
    payload,
    signatureHeader: signature,
    webhookSecret: secret,
  });

  assert.deepEqual(result, { ok: true });
});
