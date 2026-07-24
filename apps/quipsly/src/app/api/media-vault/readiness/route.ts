import { NextResponse } from "next/server";

import { getMediaVaultReadiness } from "@/lib/server/media-vault";
import { mockMediaUploadsAllowed } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const mediaVault = getMediaVaultReadiness();

  return NextResponse.json({
    ok: true,
    signedIn: Boolean(session?.user),
    providerSecretsExposed: false,
    mediaVault,
    mockUploads: {
      allowed: mockMediaUploadsAllowed(),
      envFlag: "QUIPSLY_ALLOW_MOCK_UPLOADS",
      productionAllowed: false,
      boundary:
        "Mock upload URLs are local-only development scaffolding. Production upload readiness requires real signed URLs and a configured media-vault bucket.",
    },
    actions: {
      directUpload: "/api/upload/presigned",
      inventory: "/api/media-vault/inventory",
      episodeInventory: "/api/media-vault/episode-inventory",
      registerProxy: "/api/media-vault/proxies/register",
      promoteRecording: "/api/mobile/capture/recordings/promote",
      captureReadiness: "/api/mobile/capture/readiness",
    },
    recordingToEditorBoundary: {
      sourceOfTruth:
        "RecordingAsset owns call-room evidence first. Promotion attaches verified recordings to reusable media/editor records without moving or mutating originals.",
      proxyRule:
        "Video recordings need proxy registration before collaborative editor playback should treat them as proxy-ready.",
      noOriginalMutation: true,
    },
  });
}
