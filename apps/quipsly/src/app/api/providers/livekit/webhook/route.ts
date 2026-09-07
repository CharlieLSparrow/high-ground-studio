import { NextResponse } from "next/server";

import {
  applyLiveKitProviderWebhook,
  getProviderRecordingEnvironment,
  ProviderRecordingCommandError,
} from "@/lib/server/provider-recording-command";
import { verifyLiveKitWebhook } from "@/lib/server/livekit-egress-provider";
import { reconcileLiveKitParticipantJoin } from "@/lib/server/session-access-reconciliation";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1_000_000;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/webhook+json") && !contentType.includes("application/json")) {
    return NextResponse.json(
      { ok: false, error: "LiveKit webhook content type is not supported." },
      { status: 415 },
    );
  }
  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { ok: false, error: "LiveKit webhook body is empty or too large." },
      { status: 413 },
    );
  }
  const authorization = request.headers.get("authorization") || "";
  if (!authorization) {
    return NextResponse.json(
      { ok: false, error: "LiveKit webhook signature is required." },
      { status: 401 },
    );
  }
  const environment = getProviderRecordingEnvironment();
  if (!environment.apiKey || !environment.apiSecret) {
    return NextResponse.json(
      { ok: false, error: "LiveKit webhook verification is not configured." },
      { status: 503 },
    );
  }

  let evidence;
  try {
    evidence = await verifyLiveKitWebhook({
      rawBody,
      authorization,
      apiKey: environment.apiKey,
      apiSecret: environment.apiSecret,
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_LIVEKIT_WEBHOOK", error: "LiveKit webhook signature or payload could not be verified." },
      { status: 401 },
    );
  }
  try {
    const access = await reconcileLiveKitParticipantJoin(evidence);
    if (access) {
      const pending = access.status === "FAILED" || access.status === "BLOCKED";
      return NextResponse.json({ ok: !pending, access }, { status: pending ? 503 : 200 });
    }
    const result = await applyLiveKitProviderWebhook({ evidence });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ProviderRecordingCommandError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, code: "LIVEKIT_WEBHOOK_RETRY", error: "LiveKit event handling did not complete. Retry delivery." },
      { status: 503 },
    );
  }
}
