import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // In production, you would verify state against cookies here
  if (!code) {
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=missing_code`);
  }

  try {
    const tokenResponse = await fetch("https://www.patreon.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: process.env.PATREON_CLIENT_ID || "",
        client_secret: process.env.PATREON_CLIENT_SECRET || "",
        redirect_uri: `${url.origin}/api/connections/patreon/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("[Patreon] Token exchange failed:", tokenData);
      return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=token_exchange_failed`);
    }

    // Get user identity
    const identityResponse = await fetch("https://www.patreon.com/api/oauth2/v2/identity?fields[user]=email,full_name", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    
    const identityData = await identityResponse.json();
    if (!identityResponse.ok || !identityData.data) {
      console.error("[Patreon] Identity fetch failed:", identityData);
      return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=identity_failed`);
    }

    const patreonUserId = identityData.data.id;
    const patreonEmail = identityData.data.attributes.email;

    const prisma = getPrismaClient();

    await prisma.socialAccount.upsert({
      where: {
        platform_handle: {
          platform: "patreon",
          handle: patreonUserId,
        },
      },
      create: {
        userId,
        platform: "patreon",
        handle: patreonUserId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      },
    });

    return NextResponse.redirect(`${url.origin}/settings?patreon_connected=true`);
  } catch (error) {
    console.error("[Patreon] Connection error:", error);
    return NextResponse.redirect(`${url.origin}/settings?error=connection_failed`);
  }
}
