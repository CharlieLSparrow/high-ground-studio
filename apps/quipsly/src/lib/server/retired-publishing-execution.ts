export const LEGACY_PUBLISHING_EXECUTION_RETIRED = "LEGACY_PUBLISHING_EXECUTION_RETIRED";
export const LEGACY_PUBLISHING_EXECUTION_ERROR =
  "Legacy publishing execution is retired. No provider, filesystem, queue, or publication state was changed.";

export class LegacyPublishingExecutionRetiredError extends Error {
  readonly code = LEGACY_PUBLISHING_EXECUTION_RETIRED;

  constructor() {
    super(LEGACY_PUBLISHING_EXECUTION_ERROR);
    this.name = "LegacyPublishingExecutionRetiredError";
  }
}

export function failRetiredPublishingExecution(): never {
  throw new LegacyPublishingExecutionRetiredError();
}

export function retiredPublishingExecutionResponse() {
  return Response.json(
    {
      ok: false,
      errorCode: LEGACY_PUBLISHING_EXECUTION_RETIRED,
      error: LEGACY_PUBLISHING_EXECUTION_ERROR,
      canonicalReadOnlySurface: "/publishing",
      replacementRequiresAuthenticatedActor: true,
      replacementRequiresScopedAccountOwnership: true,
      replacementRequiresPersistedAttemptReceipt: true,
      requestBodyRead: false,
      providerCalled: false,
      filesystemChanged: false,
      queueChanged: false,
      publicationStateChanged: false,
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
