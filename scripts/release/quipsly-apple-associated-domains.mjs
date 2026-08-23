#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const DEFAULT_BUNDLE_ID = "com.highgroundodyssey.HighGroundCapture";

function fail(message) {
  throw new Error(message);
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  const details = (body.errors || []).map(({ status, code, title, detail }) => ({ status, code, title, detail }));
  fail(`Apple returned HTTP ${response.status}: ${JSON.stringify(details)}`);
}

export async function ensureAssociatedDomains({
  request,
  bundleIdentifier = DEFAULT_BUNDLE_ID,
  apply = false,
}) {
  const bundleURL = new URL("/v1/bundleIds", API_ORIGIN);
  bundleURL.searchParams.set("filter[identifier]", bundleIdentifier);
  // Apple's identifier filter also returns extension identifiers with the same
  // prefix, so request the bounded page and select an exact identifier below.
  bundleURL.searchParams.set("limit", "200");
  const bundleDocument = await responseJson(await request(bundleURL, { method: "GET" }));
  const bundle = bundleDocument.data?.find(
    (entry) => entry.attributes?.identifier === bundleIdentifier,
  );
  if (!bundle?.id || bundle.attributes?.identifier !== bundleIdentifier) {
    fail(`Apple bundle ID was not found: ${bundleIdentifier}`);
  }

  const capabilitiesURL = new URL(`/v1/bundleIds/${encodeURIComponent(bundle.id)}/bundleIdCapabilities`, API_ORIGIN);
  const capabilities = await responseJson(await request(capabilitiesURL, { method: "GET" }));
  const existing = capabilities.data?.find(
    (entry) => entry.attributes?.capabilityType === "ASSOCIATED_DOMAINS",
  );
  if (existing) {
    return { ok: true, changed: false, bundleIdentifier, capability: "ASSOCIATED_DOMAINS" };
  }
  if (!apply) {
    return { ok: true, changed: false, needsApply: true, bundleIdentifier, capability: "ASSOCIATED_DOMAINS" };
  }

  const created = await responseJson(await request(
    new URL("/v1/bundleIdCapabilities", API_ORIGIN),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          type: "bundleIdCapabilities",
          attributes: { capabilityType: "ASSOCIATED_DOMAINS" },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle.id } },
          },
        },
      }),
    },
  ));
  if (created.data?.attributes?.capabilityType !== "ASSOCIATED_DOMAINS") {
    fail("Apple did not return the expected Associated Domains capability.");
  }
  return { ok: true, changed: true, bundleIdentifier, capability: "ASSOCIATED_DOMAINS" };
}

async function loadCredentials(file) {
  if (!file) fail("APP_STORE_CONNECT_API_KEY_PATH is required.");
  const metadata = await stat(file);
  if ((metadata.mode & 0o077) !== 0) fail("App Store Connect credentials must not be group- or world-readable.");
  const document = JSON.parse(await readFile(file, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) fail(`Credential is missing ${field}.`);
  }
  return document;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const credentials = await loadCredentials(process.env.APP_STORE_CONNECT_API_KEY_PATH || "");
  const token = createScopedToken({
    keyId: credentials.key_id,
    issuerId: credentials.issuer_id,
    privateKey: credentials.key,
  });
  const result = await ensureAssociatedDomains({
    apply,
    request: (url, init) => fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
