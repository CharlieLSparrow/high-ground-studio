import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getGoogleDriveAccess } from "@/lib/server/google-drive-connection";
import { getGoogleDrivePickerPublicConfig, GoogleDriveOAuthError } from "@/lib/server/google-drive-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to browse Drive." }, { status: 401 });
  try {
    const body = await request.json() as { connectionId?: unknown };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : "";
    if (!connectionId) return NextResponse.json({ error: "Choose a Drive connection.", errorCode: "connection-required" }, { status: 400 });
    const [access, picker] = await Promise.all([
      getGoogleDriveAccess({ prisma: getPrismaClient(), userId: session.user.id, connectionId, requestUrl: request.url }),
      Promise.resolve(getGoogleDrivePickerPublicConfig()),
    ]);
    return NextResponse.json({
      ok: true,
      connectionId: access.connection.id,
      accessToken: access.accessToken,
      expiresAt: new Date(Date.now() + Math.max(60, access.expiresIn - 60) * 1_000).toISOString(),
      apiKey: picker.apiKey,
      appId: picker.appId,
    }, { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof GoogleDriveOAuthError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    console.error("[google-drive-picker-token] failed", error);
    return NextResponse.json({ error: "Google Drive could not prepare the picker." }, { status: 500 });
  }
}
