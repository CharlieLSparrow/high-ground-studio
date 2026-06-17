import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  
  const cookieStore = await cookies();
  const savedState = cookieStore.get("youtube_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=invalid_state`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=unauthorized`);
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID || "dummy";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "dummy";

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/api/connections/youtube/callback`,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokens = await tokenResponse.json();
  if (tokens.error) {
    console.error("YouTube token error:", tokens);
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=token_failed`);
  }

  const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });
  
  const channelData = await channelResponse.json();
  if (channelData.error) {
    console.error("YouTube channel error:", channelData);
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=channel_fetch_failed`);
  }

  const handle = channelData.items?.[0]?.snippet?.customUrl || channelData.items?.[0]?.snippet?.title || "Unknown Channel";

  const prisma = getPrismaClient();
  
  await prisma.socialAccount.upsert({
    where: {
      platform_handle: {
        platform: "youtube",
        handle,
      },
    },
    update: {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      userId: session.user.id,
    },
    create: {
      platform: "youtube",
      handle,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId: session.user.id,
    },
  });

  const response = NextResponse.redirect(`${url.origin}/publishing-suite/connections`);
  response.cookies.delete("youtube_oauth_state");
  
  return response;
}
