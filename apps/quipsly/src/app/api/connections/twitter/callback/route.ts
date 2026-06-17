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
  const savedState = cookieStore.get("twitter_oauth_state")?.value;
  const codeVerifier = cookieStore.get("twitter_code_verifier")?.value;

  if (!code || !state || !savedState || !codeVerifier || state !== savedState) {
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=invalid_state`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=unauthorized`);
  }

  const clientId = process.env.TWITTER_CLIENT_ID || "dummy";
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || "dummy";

  const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/api/connections/twitter/callback`,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  const tokens = await tokenResponse.json();
  if (tokens.error) {
    console.error("Twitter token error:", tokens);
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=token_failed`);
  }

  const userResponse = await fetch("https://api.twitter.com/2/users/me", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });
  
  const userData = await userResponse.json();
  if (userData.errors) {
    console.error("Twitter user error:", userData);
    return NextResponse.redirect(`${url.origin}/publishing-suite/connections?error=user_fetch_failed`);
  }

  const prisma = getPrismaClient();
  
  await prisma.socialAccount.upsert({
    where: {
      platform_handle: {
        platform: "twitter",
        handle: userData.data.username,
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId: session.user.id,
    },
    create: {
      platform: "twitter",
      handle: userData.data.username,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userId: session.user.id,
    },
  });

  const response = NextResponse.redirect(`${url.origin}/publishing-suite/connections`);
  response.cookies.delete("twitter_oauth_state");
  response.cookies.delete("twitter_code_verifier");
  
  return response;
}
