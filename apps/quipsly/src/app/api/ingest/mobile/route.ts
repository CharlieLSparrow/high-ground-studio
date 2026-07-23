import { NextResponse } from "next/server";

import { MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND } from "@/lib/server/mobile-capture-security";
import { buildMobileCaptureLocalRetention } from "@high-ground/quipsly-domain/mobile-capture-upload";

export const runtime = "nodejs";

// Historical multipart capture ingress buffered the entire request in instance
// memory. It is deliberately unavailable before request parsing or auth/DB
// work. Devices retain their local source and restart through resumable v2.
export async function POST() {
  return NextResponse.json({
    ok: false,
    code: "LEGACY_MOBILE_MULTIPART_DISABLED",
    error: "Legacy server-buffered capture upload is disabled. Use the canonical resumable upload route.",
    canonicalUploadRoute: "/api/mobile/capture/uploads/resumable",
    canonicalContractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    localRetention: buildMobileCaptureLocalRetention(),
  }, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}
