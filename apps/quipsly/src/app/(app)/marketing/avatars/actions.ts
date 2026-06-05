"use server";

import { getPrismaClient } from "@/lib/prisma";

export async function saveMarketingPersona(personaData: any, rawCsv?: string) {
  const prisma = getPrismaClient();
  try {
    // For prototype, just use the first available user
    const firstUser = await prisma.user.findFirst();
    
    if (!firstUser) {
      throw new Error("No users found in database to attach persona to.");
    }

    const persona = await prisma.marketingPersona.create({
      data: {
        userId: firstUser.id,
        name: personaData.name,
        avatarImageUrl: personaData.avatarImageUrl || `/avatars/quipsly_avatar_${Math.floor(Math.random() * 3) + 1}.png`,
        demographics: personaData.demographics,
        psychographics: personaData.psychographics,
        painPointsJson: personaData.painPointsJson,
        desiresJson: personaData.desiresJson,
        objectionsJson: personaData.objectionsJson,
        contentPillarsJson: personaData.contentPillarsJson,
        sourceDataJson: rawCsv ? { rawText: rawCsv } : { source: 'prompt' },
      }
    });

    return { success: true, personaId: persona.id };
  } catch (error: any) {
    console.error("Failed to save Marketing Persona:", error);
    return { success: false, error: error.message };
  }
}
