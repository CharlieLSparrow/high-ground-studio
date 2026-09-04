#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { summarizeCloudRunCapabilities } from "./quipsly-cloud-run-capability-readback.mjs";

export const RELEASE_FEATURE_KEYS = [
  "ENABLE_GOOGLE_CALENDAR_OAUTH",
  "ENABLE_GOOGLE_DRIVE_OAUTH",
  "ENABLE_TRANSCRIPT_WORKER",
  "ENABLE_ACCOUNT_DELETION_WORKER",
  "ENABLE_SESSION_INVITATION_EMAIL",
  "ENABLE_STRIPE_SAAS",
  "ENABLE_LIVEKIT_PROVIDER",
  "CONFIGURE_LIVEKIT_EGRESS",
  "ENABLE_LIVEKIT_EGRESS",
];

function inheritedBoolean(label, state) {
  if (state?.enabled === false) return "0";
  if (state?.configured && !state?.ready) {
    throw new Error(
      `Refusing to inherit partially configured ${label}; repair it or provide an explicit release override.`,
    );
  }
  return state?.ready ? "1" : "0";
}

export function deriveReleaseFeatureFlags(
  serviceDocument,
  { explicitFeatureKeys = [] } = {},
) {
  const report = summarizeCloudRunCapabilities(serviceDocument);
  const explicit = new Set(explicitFeatureKeys);
  for (const key of explicit) {
    if (!RELEASE_FEATURE_KEYS.includes(key)) {
      throw new Error(`Unknown explicit release feature key: ${key}.`);
    }
  }
  if (
    report.capabilities.providerEgress.enabled
    && !report.capabilities.providerEgress.configured
    && !(
      explicit.has("CONFIGURE_LIVEKIT_EGRESS")
      && explicit.has("ENABLE_LIVEKIT_EGRESS")
    )
  ) {
    throw new Error(
      "Refusing to inherit enabled LiveKit egress without both protected destination bindings.",
    );
  }
  const inherited = (key, label, state) => explicit.has(key)
    ? "0"
    : inheritedBoolean(label, state);
  return {
    ENABLE_GOOGLE_CALENDAR_OAUTH: inherited(
      "ENABLE_GOOGLE_CALENDAR_OAUTH",
      "Google Calendar",
      report.capabilities.googleCalendar,
    ),
    ENABLE_GOOGLE_DRIVE_OAUTH: inherited(
      "ENABLE_GOOGLE_DRIVE_OAUTH",
      "Google Drive",
      report.capabilities.googleDrive,
    ),
    ENABLE_TRANSCRIPT_WORKER: inherited(
      "ENABLE_TRANSCRIPT_WORKER",
      "transcript dispatch",
      report.capabilities.transcriptDispatch,
    ),
    ENABLE_ACCOUNT_DELETION_WORKER: inherited(
      "ENABLE_ACCOUNT_DELETION_WORKER",
      "account deletion",
      report.capabilities.accountDeletion,
    ),
    ENABLE_SESSION_INVITATION_EMAIL: inherited(
      "ENABLE_SESSION_INVITATION_EMAIL",
      "invitation email",
      report.capabilities.invitationEmail,
    ),
    ENABLE_STRIPE_SAAS: inherited(
      "ENABLE_STRIPE_SAAS",
      "subscriptions",
      report.capabilities.subscriptions,
    ),
    ENABLE_LIVEKIT_PROVIDER: inherited(
      "ENABLE_LIVEKIT_PROVIDER",
      "LiveKit conversation",
      report.capabilities.liveConversation,
    ),
    CONFIGURE_LIVEKIT_EGRESS:
      explicit.has("CONFIGURE_LIVEKIT_EGRESS")
        ? "0"
        : report.capabilities.providerEgress.configured ? "1" : "0",
    ENABLE_LIVEKIT_EGRESS:
      explicit.has("ENABLE_LIVEKIT_EGRESS")
        ? "0"
        : report.capabilities.providerEgress.enabled ? "1" : "0",
  };
}

export function serializeReleaseFeatureFlags(flags) {
  return `${RELEASE_FEATURE_KEYS.map((key) => {
    const value = flags[key];
    if (value !== "0" && value !== "1") {
      throw new Error(`Invalid inherited release value for ${key}.`);
    }
    return `${key}=${value}`;
  }).join("\n")}\n`;
}

function main() {
  const [serviceJSONPath] = process.argv.slice(2);
  if (process.argv.length > 3) {
    throw new Error("Usage: quipsly-release-feature-inheritance.mjs [service-json]");
  }
  const source = serviceJSONPath
    ? readFileSync(serviceJSONPath, "utf8")
    : readFileSync(0, "utf8");
  const explicitFeatureKeys = String(
    process.env.QUIPSLY_RELEASE_EXPLICIT_FEATURE_KEYS || "",
  ).split(",").map((value) => value.trim()).filter(Boolean);
  process.stdout.write(
    serializeReleaseFeatureFlags(deriveReleaseFeatureFlags(
      JSON.parse(source),
      { explicitFeatureKeys },
    )),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
