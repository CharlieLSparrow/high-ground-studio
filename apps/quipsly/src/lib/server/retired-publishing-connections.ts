import { NextResponse } from "next/server";

export const RETIRED_PUBLISHING_CONNECTION_CODE = "LEGACY_PUBLISHING_CONNECTION_ROUTE_RETIRED";

/**
 * The retired Transmitter prototype had two parallel OAuth implementations.
 * Neither provided a tenant-scoped, receipt-backed account ownership boundary.
 * Keep every historical entry point inert until a replacement owns state,
 * credentials, callback origins, account uniqueness, and disconnect/revoke
 * behavior as one reviewed workflow.
 */
export function retiredPublishingConnectionResponse() {
  return NextResponse.json(
    {
      ok: false,
      errorCode: RETIRED_PUBLISHING_CONNECTION_CODE,
      error: "Legacy publishing account connections are retired. No provider authorization was started and no callback code was processed.",
      archivedSurface: "/publishing-suite/connections",
      canonicalReadOnlySurface: "/publishing",
      providerAuthorizationStarted: false,
      providerCalled: false,
      credentialsRead: false,
      callbackProcessed: false,
      dataWritten: false,
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
