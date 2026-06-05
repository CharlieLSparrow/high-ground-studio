import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { HgoPublicEpisodeIndexEntry } from "@/lib/hgo/public-episode-packet";

const INDEX_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "publish", "hgo-episodes", "episodes-index.json");

export async function GET() {
  try {
    const indexContent = await fs.readFile(INDEX_PATH, "utf8");
    const indexRecord: Record<string, HgoPublicEpisodeIndexEntry> = JSON.parse(indexContent);
    
    const episodes = Object.values(indexRecord);
    
    // Sort by episode number (assuming format like "001", "002")
    episodes.sort((a, b) => a.episodeNumber.localeCompare(b.episodeNumber));

    return NextResponse.json({ ok: true, episodes });
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      // Index doesn't exist yet
      return NextResponse.json({ ok: true, episodes: [] });
    }
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
