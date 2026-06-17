import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  const twitterAuthUrl = new URL("https://twitter.com/i/oauth2/authorize");
  twitterAuthUrl.searchParams.set("response_type", "code");
  twitterAuthUrl.searchParams.set("client_id", process.env.TWITTER_CLIENT_ID || "dummy");
  twitterAuthUrl.searchParams.set("redirect_uri", `${url.origin}/api/connections/twitter/callback`);
  twitterAuthUrl.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
  twitterAuthUrl.searchParams.set("state", state);
  twitterAuthUrl.searchParams.set("code_challenge", codeChallenge);
  twitterAuthUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(twitterAuthUrl.toString());
  response.cookies.set("twitter_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" });
  response.cookies.set("twitter_code_verifier", codeVerifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" });

  return response;
}
