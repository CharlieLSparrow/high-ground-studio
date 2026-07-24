const VERIFIED_SOCIAL_WEBHOOK_NOT_IMPLEMENTED = "VERIFIED_SOCIAL_WEBHOOK_NOT_IMPLEMENTED";

// Retired before body parsing or persistence. The historical receiver trusted
// a caller-supplied platform header, had no provider signature verification,
// and invented fallback interaction identities. A replacement must verify a
// provider-specific signature and replay-safe event ID before writing an inbox
// receipt.
export async function POST() {
  return Response.json(
    {
      ok: false,
      errorCode: VERIFIED_SOCIAL_WEBHOOK_NOT_IMPLEMENTED,
      error: "Social provider ingestion is unavailable until a signed, replay-safe webhook contract is implemented. Nothing was recorded.",
      verifiedProviderSignatureRequired: true,
      stableProviderEventIdRequired: true,
      requestBodyRead: false,
      providerStateClaimed: false,
      persistenceChanged: false,
    },
    {
      status: 501,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
