import { NextResponse } from "next/server";

import {
  getMobileCaptureLocalVaultConfig,
  localUploadCapabilityMatches,
  writeLocalMobileCaptureObject,
} from "@/lib/server/mobile-capture-local-vault";
import {
  loadMobileCaptureResumableManifest,
  mobileCaptureObjectCustomMetadata,
  mobileCaptureUploadUriIsExpired,
} from "@/lib/server/mobile-capture-resumable-store";
import { isSafeMobileCaptureUploadSessionId } from "@/lib/server/mobile-capture-security";

export const runtime = "nodejs";

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function configuredMaximumBytes() {
  const value = Number(process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_MAX_BYTES || 256 * 1024 * 1024);
  return Number.isSafeInteger(value) && value > 0 ? value : 256 * 1024 * 1024;
}

export async function PUT(request: Request, context: { params: Promise<{ uploadSessionId: string }> }) {
  let config;
  try {
    config = getMobileCaptureLocalVaultConfig();
  } catch {
    return json({ ok: false, error: "Local Capture upload is unavailable." }, 404);
  }
  const expectedHost = config ? new URL(config.origin).host.toLowerCase() : "";
  const requestHost = request.headers.get("host")?.trim().toLowerCase();
  if (!config || !requestHost || requestHost !== expectedHost) {
    return json({ ok: false, error: "Local Capture upload is unavailable." }, 404);
  }

  const uploadSessionId = (await context.params).uploadSessionId.trim().toLowerCase();
  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) {
    return json({ ok: false, error: "Upload session ID must be a UUID." }, 400);
  }
  const stored = await loadMobileCaptureResumableManifest(uploadSessionId);
  if (!stored || stored.manifest.storageBackend !== "local-development") {
    return json({ ok: false, error: "Local Capture upload session not found." }, 404);
  }
  const manifest = stored.manifest;
  if (!localUploadCapabilityMatches(
    manifest.localUploadTokenSha256,
    request.headers.get("x-quipsly-local-capture-capability"),
  )) {
    return json({ ok: false, error: "Local Capture upload capability is invalid." }, 403);
  }
  if (mobileCaptureUploadUriIsExpired(manifest)) {
    return json({ ok: false, error: "Local Capture upload capability expired; recover the same session before retrying." }, 410);
  }
  if (manifest.expectedSizeBytes > configuredMaximumBytes()) {
    return json({ ok: false, error: "Local Capture source exceeds the configured development-vault limit." }, 413);
  }
  const contentLength = Number(request.headers.get("content-length"));
  const contentRange = request.headers.get("content-range")?.trim();
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    contentLength !== manifest.expectedSizeBytes
    || contentRange !== `bytes 0-${manifest.expectedSizeBytes - 1}/${manifest.expectedSizeBytes}`
    || contentType !== manifest.contentType.toLowerCase()
  ) {
    return json({ ok: false, error: "Local Capture upload headers do not match the immutable manifest." }, 409);
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength !== manifest.expectedSizeBytes) {
    return json({ ok: false, error: "Local Capture upload body size does not match the immutable manifest." }, 409);
  }
  const object = await writeLocalMobileCaptureObject({
    objectName: manifest.objectName,
    bytes,
    contentType: manifest.contentType,
    customMetadata: mobileCaptureObjectCustomMetadata(manifest),
  });
  if (!object || object.sizeBytes !== manifest.expectedSizeBytes) {
    return json({ ok: false, error: "Local Capture object receipt could not be verified after write." }, 503);
  }
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Quipsly-Local-Development-Vault": "written",
    },
  });
}
