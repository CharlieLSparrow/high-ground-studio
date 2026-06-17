import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  const state = crypto.randomBytes(16).toString("hex");

  const patreonAuthUrl = new URL("https://www.patreon.com/oauth2/authorize");
  patreonAuthUrl.searchParams.set("response_type", "code");
  patreonAuthUrl.searchParams.set("client_id", process.env.PATREON_CLIENT_ID || "dummy");
  patreonAuthUrl.searchParams.set("redirect_uri", `${url.origin}/api/connections/patreon/callback`);
  // Patreon scopes. identity is needed to get user id/email. campaigns, memberships if needed later.
  patreonAuthUrl.searchParams.set("scope", "identity identity[email]");
  patreonAuthUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(patreonAuthUrl.toString());
  response.cookies.set("patreon_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" });

  return response;
}
