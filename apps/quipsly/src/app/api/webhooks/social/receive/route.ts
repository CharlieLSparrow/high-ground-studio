import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

/**
 * Webhook endpoint for receiving real-time interactions (comments, DMs)
 * from social platforms like YouTube or X/Twitter.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const platform = req.headers.get("x-social-platform"); // Expected: "youtube_v3", "x_twitter", etc.

    if (!platform) {
      return NextResponse.json({ error: "Missing platform header" }, { status: 400 });
    }

    const prisma = getPrismaClient();

    // Naive parsing based on platform
    let interactionData = null;

    if (platform === "youtube_v3") {
      // Mock parsing for a YouTube CommentThread webhook
      interactionData = {
        platform: "youtube_v3",
        interactionType: "comment",
        externalId: payload.id || `yt-comment-${Date.now()}`,
        parentPostId: payload.videoId || null,
        authorName: payload.authorDisplayName || "YouTube User",
        content: payload.textDisplay || "New comment",
      };
    } else if (platform === "x_twitter") {
      // Mock parsing for Twitter Account Activity API
      interactionData = {
        platform: "x_twitter",
        interactionType: "mention",
        externalId: payload.tweet_create_events?.[0]?.id_str || `x-mention-${Date.now()}`,
        parentPostId: payload.tweet_create_events?.[0]?.in_reply_to_status_id_str || null,
        authorName: payload.tweet_create_events?.[0]?.user?.screen_name || "TwitterUser",
        content: payload.tweet_create_events?.[0]?.text || "New mention",
      };
    }

    if (interactionData) {
      await prisma.worldHubSocialInteraction.upsert({
        where: { externalId: interactionData.externalId },
        update: {}, // if it exists, do nothing or update content
        create: interactionData,
      });
      return NextResponse.json({ status: "processed" }, { status: 200 });
    } else {
      return NextResponse.json({ error: "Unsupported platform payload" }, { status: 400 });
    }

  } catch (err) {
    console.error("[Webhook Error]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
