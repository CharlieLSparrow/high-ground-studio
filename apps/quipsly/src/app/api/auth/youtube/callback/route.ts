import { NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/youtube/callback`
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Write tokens to a local file so the publishing engine can use them.
    // In a fully multi-tenant app this would go to the Account table in the DB.
    const tokenPath = path.join(process.cwd(), ".youtube_token.json");
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), "utf8");

    return NextResponse.json({ 
      success: true, 
      message: "YouTube authorized successfully. Tokens saved to .youtube_token.json.",
      note: "You can also add the refresh token to your .env file as YOUTUBE_REFRESH_TOKEN",
      refreshToken: tokens.refresh_token
    });
  } catch (error: any) {
    console.error("Error getting YouTube OAuth tokens:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
