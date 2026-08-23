import assert from "node:assert/strict";
import test from "node:test";

import { ensureAssociatedDomains } from "./quipsly-apple-associated-domains.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("does not mutate an already-enabled capability", async () => {
  const calls = [];
  const result = await ensureAssociatedDomains({
    apply: true,
    request: async (url, init) => {
      calls.push([String(url), init.method]);
      if (calls.length === 1) return response({ data: [{ id: "bundle-1", attributes: { identifier: "com.highgroundodyssey.HighGroundCapture" } }] });
      return response({ data: [{ id: "cap-1", attributes: { capabilityType: "ASSOCIATED_DOMAINS" } }] });
    },
  });
  assert.equal(result.changed, false);
  assert.equal(calls.length, 2);
});

test("selects the exact app bundle when Apple returns prefix matches", async () => {
  const urls = [];
  const result = await ensureAssociatedDomains({
    request: async (url) => {
      urls.push(String(url));
      if (urls.length === 1) return response({ data: [
        { id: "extension-bundle", attributes: { identifier: "com.highgroundodyssey.HighGroundCapture.ShareCapture" } },
        { id: "bundle-1", attributes: { identifier: "com.highgroundodyssey.HighGroundCapture" } },
      ] });
      return response({ data: [{ id: "cap-1", attributes: { capabilityType: "ASSOCIATED_DOMAINS" } }] });
    },
  });
  assert.equal(result.changed, false);
  assert.match(urls[1], /\/v1\/bundleIds\/bundle-1\/bundleIdCapabilities$/);
});

test("dry-run reports the missing capability without changing Apple", async () => {
  const methods = [];
  const result = await ensureAssociatedDomains({
    request: async (_url, init) => {
      methods.push(init.method);
      return methods.length === 1
        ? response({ data: [{ id: "bundle-1", attributes: { identifier: "com.highgroundodyssey.HighGroundCapture" } }] })
        : response({ data: [] });
    },
  });
  assert.equal(result.needsApply, true);
  assert.deepEqual(methods, ["GET", "GET"]);
});

test("apply creates only Associated Domains for the exact bundle ID", async () => {
  const calls = [];
  const result = await ensureAssociatedDomains({
    apply: true,
    request: async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) return response({ data: [{ id: "bundle-1", attributes: { identifier: "com.highgroundodyssey.HighGroundCapture" } }] });
      if (calls.length === 2) return response({ data: [] });
      return response({ data: { id: "cap-1", attributes: { capabilityType: "ASSOCIATED_DOMAINS" } } }, 201);
    },
  });
  assert.equal(result.changed, true);
  assert.equal(calls[2].init.method, "POST");
  const body = JSON.parse(calls[2].init.body);
  assert.equal(body.data.attributes.capabilityType, "ASSOCIATED_DOMAINS");
  assert.equal(body.data.relationships.bundleId.data.id, "bundle-1");
});
