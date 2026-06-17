import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/publishing/StorageAdapter";
import path from "path";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name);
    const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    
    const storage = getStorageProvider();
    const publicUrl = await storage.uploadFile(filename, buffer, file.type);
    
    const prisma = getPrismaClient();
    const asset = await prisma.studioAsset.create({
      data: {
        filename: file.name,
        url: publicUrl,
        mimeType: file.type,
        sizeBytes: buffer.length,
        tagsJson: [],
      }
    });

    return NextResponse.json({ success: true, asset });
  } catch (err) {
    console.error("[Upload Error]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
