import { NextResponse } from "next/server";
import { authorizeGoogleOidcWorker } from "@/lib/server/google-oidc-worker-auth";
import { reconcileLiveSessionAccess } from "@/lib/server/session-access-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeGoogleOidcWorker({
    authorization: request.headers.get("authorization"),
    expectedEmail: process.env.SESSION_ACCESS_WORKER_SERVICE_ACCOUNT,
    audience: process.env.SESSION_ACCESS_WORKER_AUDIENCE,
  });
  if (authorization !== "authorized")
    return NextResponse.json(
      {
        ok: false,
        error:
          authorization === "not-configured"
            ? "Session access maintenance is not configured."
            : "Unauthorized.",
      },
      { status: authorization === "not-configured" ? 503 : 401, headers },
    );
  try {
    const result = await reconcileLiveSessionAccess();
    return NextResponse.json(
      { ok: result.failed === 0 && result.deferred === 0, result },
      {
        status: result.failed || result.deferred ? 503 : 200,
        headers,
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Session access maintenance did not complete." },
      { status: 503, headers },
    );
  }
}
