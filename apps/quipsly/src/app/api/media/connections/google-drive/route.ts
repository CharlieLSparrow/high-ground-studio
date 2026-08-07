import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { disconnectGoogleDriveConnection, listGoogleDriveConnections } from "@/lib/server/google-drive-connection";
import { getGoogleDrivePickerPublicConfig, GoogleDriveOAuthError } from "@/lib/server/google-drive-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to manage media connections." }, { status: 401 });
  const connections = await listGoogleDriveConnections(getPrismaClient(), session.user.id);
  let pickerConfigured = true;
  try {
    getGoogleDrivePickerPublicConfig();
  } catch (error) {
    if (!(error instanceof GoogleDriveOAuthError)) throw error;
    pickerConfigured = false;
  }
  return NextResponse.json({
    ok: true,
    provider: "google-drive",
    pickerConfigured,
    connections: connections.map((connection) => ({
      ...connection,
      verifiedAt: connection.verifiedAt?.toISOString() ?? null,
      lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
      revokedAt: connection.revokedAt?.toISOString() ?? null,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to disconnect media connections." }, { status: 401 });
  try {
    const body = await request.json() as { connectionId?: unknown; clientRequestId?: unknown };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : "";
    const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";
    if (!connectionId) return NextResponse.json({ error: "Choose a Drive connection.", errorCode: "connection-required" }, { status: 400 });
    const result = await disconnectGoogleDriveConnection({
      prisma: getPrismaClient(),
      userId: session.user.id,
      connectionId,
      clientRequestId,
      requestUrl: request.url,
    });
    return NextResponse.json({
      ok: true,
      connection: { id: result.connection.id, status: result.connection.status, revision: result.connection.revision },
      replayed: result.replayed,
      providerResult: result.providerResult,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof GoogleDriveOAuthError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    console.error("[google-drive-connection] disconnect failed", error);
    return NextResponse.json({ error: "Google Drive could not be disconnected." }, { status: 500 });
  }
}
