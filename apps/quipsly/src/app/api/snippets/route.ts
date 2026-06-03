import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(req: Request) {
  const prisma = getPrismaClient();

  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== "Bearer hgs_dev_token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sourceUrl, sourceTitle, highlightedText, note } = body;

    if (!highlightedText && !sourceUrl) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    // For now, we will assign it to the first user in the DB
    // In production, the extension would send a real JWT
    const firstUser = await prisma.user.findFirst();

    if (!firstUser) {
      return NextResponse.json({ error: "No users found in database" }, { status: 500 });
    }

    const snippet = await prisma.snippet.create({
      data: {
        userId: firstUser.id,
        sourceUrl,
        sourceTitle,
        highlightedText: highlightedText || "",
        note
      }
    });

    return NextResponse.json({ success: true, snippet });
  } catch (error) {
    console.error("Failed to save snippet:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
