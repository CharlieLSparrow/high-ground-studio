import { NextResponse } from "next/server";

import { MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND } from "@/lib/server/mobile-capture-security";
import { buildMobileCaptureLocalRetention } from "@high-ground/quipsly-domain/mobile-capture-upload";

export const runtime = "nodejs";

// Historical instance-local chunk assembly had no safe aggregate bound and
// ended in a whole-file RAM read. Reject before reading headers or body bytes.
export async function POST() {
  return NextResponse.json({
    ok: false,
    code: "LEGACY_MOBILE_CHUNK_DISABLED",
    error: "Legacy server-buffered chunk upload is disabled. Use the canonical resumable upload route.",
    canonicalUploadRoute: "/api/mobile/capture/uploads/resumable",
    canonicalContractKind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    localRetention: buildMobileCaptureLocalRetention(),
  }, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}
