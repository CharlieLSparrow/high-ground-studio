"use server";

import { getPrismaClient } from "@/lib/prisma";

export async function fetchStudioAssets() {
  const prisma = getPrismaClient();
  return await prisma.studioAsset.findMany({
    orderBy: { createdAt: "desc" }
  });
}
