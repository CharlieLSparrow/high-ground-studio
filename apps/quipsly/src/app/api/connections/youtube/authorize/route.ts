import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  const state = crypto.randomBytes(16).toString("hex");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("client_id", process.env.YOUTUBE_CLIENT_ID || "dummy");
  googleAuthUrl.searchParams.set("redirect_uri", `${url.origin}/api/connections/youtube/callback`);
  googleAuthUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/youtube.force-ssl");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set("youtube_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" });

  return response;
}
