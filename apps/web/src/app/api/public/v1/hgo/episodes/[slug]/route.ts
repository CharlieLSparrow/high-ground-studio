import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { parseHgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

const EPISODES_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "publish", "hgo-episodes");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug parameter." }, { status: 400 });
  }

  const filePath = path.join(EPISODES_DIR, `${slug}.json`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = parseHgoPublicEpisodePacket(content);

    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "Packet is corrupt or invalid." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, packet: parsed.packet });
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      return NextResponse.json({ ok: false, error: "Episode not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "Internal server error." }, { status: 500 });
  }
}
