"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getVaultAssets() {
  const prisma = getPrismaClient();
  const assets = await prisma.studioVideoSource.findMany({
    orderBy: { createdAt: "desc" },
  });

  return assets.map(a => ({
    id: a.id,
    name: a.title || "Untitled Asset",
    url: a.url,
    provider: a.provider,
    date: a.createdAt.toISOString().split("T")[0],
    type: "video", // Default to video for now since it's StudioVideoSource
    size: "Unknown Size", // Not stored in schema yet
    tags: [a.provider === "internal-gcs" ? "Cloud" : "Local"]
  }));
}

export async function deleteVaultAsset(id: string) {
  const prisma = getPrismaClient();
  
  await prisma.studioVideoSource.delete({
    where: { id }
  });

  revalidatePath("/assets");
  return { success: true };
}
