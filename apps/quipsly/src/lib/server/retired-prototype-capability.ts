type RetiredPrototypeCapability =
  | "legacy-distribution-trigger"
  | "legacy-render-submit"
  | "legacy-image-workflow"
  | "legacy-shell-ingest"
  | "static-podcast-feed"
  | "starter-episode-publisher"
  | "prototype-lead-capture"
  | "unscoped-agent-registry"
  | "unscoped-asset-upload"
  | "legacy-call-signaling"
  | "unscoped-marketing-ai"
  | "unscoped-assistant-ledger"
  | "hardcoded-snippet-ingest"
  | "unscoped-storyboard-generator";

const CAPABILITIES: Record<
  RetiredPrototypeCapability,
  { status: 410 | 501; errorCode: string; error: string; canonicalSurface: string }
> = {
  "legacy-distribution-trigger": {
    status: 410,
    errorCode: "LEGACY_DISTRIBUTION_TRIGGER_RETIRED",
    error:
      "The prototype distribution trigger is retired. No job was queued and no destination was contacted.",
    canonicalSurface: "/publishing",
  },
  "legacy-render-submit": {
    status: 501,
    errorCode: "RECEIPT_BACKED_RENDER_WORKER_NOT_CONNECTED",
    error:
      "Web render submission is unavailable until a scoped worker and durable render receipt are connected. No job or artifact was created.",
    canonicalSurface: "/editor",
  },
  "legacy-image-workflow": {
    status: 501,
    errorCode: "VERIFIED_IMAGE_WORKFLOW_NOT_CONNECTED",
    error:
      "The prototype image workflow is unavailable until a real worker can return a persisted output receipt. No image was processed.",
    canonicalSurface: "/create",
  },
  "legacy-shell-ingest": {
    status: 410,
    errorCode: "LEGACY_SHELL_INGEST_RETIRED",
    error:
      "The shell-based ingest prototype is retired. No path was read and no process was started.",
    canonicalSurface: "/media",
  },
  "static-podcast-feed": {
    status: 410,
    errorCode: "STATIC_PROTOTYPE_PODCAST_FEED_RETIRED",
    error:
      "The sample podcast feed is retired because it did not represent published media. Use a project-scoped feed backed by approved publication records.",
    canonicalSurface: "/publishing",
  },
  "starter-episode-publisher": {
    status: 410,
    errorCode: "STARTER_EPISODE_PUBLISHER_RETIRED",
    error:
      "The starter-episode publisher is retired because static packets cannot prove review, media delivery, or public availability. Nothing was marked published.",
    canonicalSurface: "/publishing",
  },
  "prototype-lead-capture": {
    status: 501,
    errorCode: "VERIFIED_LEAD_CAPTURE_NOT_IMPLEMENTED",
    error:
      "Lead capture is unavailable until a public form can be bound to an owned landing page with consent, abuse controls, and a delivery receipt. No contact was recorded.",
    canonicalSurface: "/marketing/pages",
  },
  "unscoped-agent-registry": {
    status: 410,
    errorCode: "UNSCOPED_AGENT_REGISTRY_RETIRED",
    error:
      "The prototype agent registry is retired because it had no actor or tenant boundary. No agent or task was read or changed.",
    canonicalSurface: "/beta-readiness",
  },
  "unscoped-asset-upload": {
    status: 410,
    errorCode: "UNSCOPED_ASSET_UPLOAD_RETIRED",
    error:
      "The unscoped asset upload is retired. Use a Nest-scoped media-vault upload contract with quota and source receipts.",
    canonicalSurface: "/media",
  },
  "legacy-call-signaling": {
    status: 410,
    errorCode: "LEGACY_CALL_SIGNALING_RETIRED",
    error:
      "Legacy call signaling is retired because it was not bound to a signed participant or accessible session. No room state was read or changed.",
    canonicalSurface: "/schedule",
  },
  "unscoped-marketing-ai": {
    status: 410,
    errorCode: "UNSCOPED_MARKETING_AI_RETIRED",
    error:
      "The prototype marketing generator is retired because it was not scoped to a signed actor or owned source record. No provider was called and no record was changed.",
    canonicalSurface: "/create",
  },
  "unscoped-assistant-ledger": {
    status: 410,
    errorCode: "UNSCOPED_ASSISTANT_LEDGER_RETIRED",
    error:
      "The legacy assistant ledger mutation is retired. Use a signed, project-scoped action-review contract; no action status was changed.",
    canonicalSurface: "/",
  },
  "hardcoded-snippet-ingest": {
    status: 410,
    errorCode: "HARDCODED_SNIPPET_INGEST_RETIRED",
    error:
      "The prototype snippet endpoint is retired because it used a shared token and first-user ownership. No snippet was recorded.",
    canonicalSurface: "/research",
  },
  "unscoped-storyboard-generator": {
    status: 410,
    errorCode: "UNSCOPED_STORYBOARD_GENERATOR_RETIRED",
    error:
      "The prototype storyboard generator is retired because private story context could be sent to an unscoped public provider. No image was requested.",
    canonicalSurface: "/create",
  },
};

export function retiredPrototypeCapabilityResponse(capability: RetiredPrototypeCapability) {
  const config = CAPABILITIES[capability];
  return Response.json(
    {
      ok: false,
      errorCode: config.errorCode,
      error: config.error,
      canonicalSurface: config.canonicalSurface,
      requestBodyRead: false,
      externalProcessStarted: false,
      providerCalled: false,
      jobQueued: false,
      artifactCreated: false,
      persistenceChanged: false,
    },
    {
      status: config.status,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
