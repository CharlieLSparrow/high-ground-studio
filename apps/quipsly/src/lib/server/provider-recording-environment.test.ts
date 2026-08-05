/** @jest-environment node */

import { getProviderRecordingEnvironment } from "./provider-recording-command";

const keys = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_EGRESS_GCS_BUCKET",
  "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON",
  "LIVEKIT_EGRESS_WEBHOOK_URL",
  "QUIPSLY_PUBLIC_ORIGIN",
  "NEXTAUTH_URL",
  "AUTH_URL",
  "QUIPSLY_APP_HOST",
  "LIVEKIT_EGRESS_ENABLED",
] as const;

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function clear() {
  for (const key of keys) delete process.env[key];
}

describe("provider recording environment", () => {
  beforeEach(clear);

  afterAll(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("derives the signed webhook endpoint from the canonical app host", () => {
    process.env.LIVEKIT_URL = "wss://provider.example.test";
    process.env.LIVEKIT_API_KEY = "api-key";
    process.env.LIVEKIT_API_SECRET = "api-secret";
    process.env.LIVEKIT_EGRESS_GCS_BUCKET = "provider-bucket";
    process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON = "{}";
    process.env.QUIPSLY_APP_HOST = "nest.quipsly.com";
    process.env.LIVEKIT_EGRESS_ENABLED = "true";

    expect(getProviderRecordingEnvironment()).toMatchObject({
      webhookUrl: "https://nest.quipsly.com/api/providers/livekit/webhook",
      webhookConfigured: true,
      egressRequested: true,
      egressEnabled: true,
      missing: [],
    });
  });
});
