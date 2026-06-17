import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const episodeSlug = searchParams.get("episodeSlug");

    if (!projectId || !episodeSlug) {
      return NextResponse.json({ error: "Missing projectId or episodeSlug" }, { status: 400 });
    }

    const sidecarPath = path.join(process.cwd(), "data", "artifacts", "sidecar.json");
    let artifacts = [];
    if (fs.existsSync(sidecarPath)) {
      artifacts = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    }

    const filtered = artifacts.filter(
      (a: any) => a.projectId === projectId && a.episodeSlug === episodeSlug
    );

    return NextResponse.json({ artifacts: filtered });
  } catch (error: any) {
    console.error("Error in Artifacts API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
