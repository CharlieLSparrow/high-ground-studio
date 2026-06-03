"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Ensures there is a default Universe and some Factions to work with
 * in the Romance Lab.
 */
async function ensureDefaultUniverse() {
  const prisma = await getPrismaClient();

  let universe = await prisma.romanceUniverse.findFirst({
    where: { name: "The Thornfield Files" }
  });

  if (!universe) {
    universe = await prisma.romanceUniverse.create({
      data: {
        name: "The Thornfield Files",
        description: "A paranormal romance series set in Thornfield, Oregon."
      }
    });

    // Seed some default factions
    await prisma.romanceFaction.createMany({
      data: [
        { universeId: universe.id, name: "The Old Blood", description: "The ruling vampire council." },
        { universeId: universe.id, name: "The Unmoored", description: "Ghosts and outcasts." },
        { universeId: universe.id, name: "The Hearthstone Circle", description: "The local witch coven." }
      ]
    });
  }

  return universe;
}

export async function getFactions() {
  const prisma = await getPrismaClient();
  const universe = await ensureDefaultUniverse();

  return prisma.romanceFaction.findMany({
    where: { universeId: universe.id },
    orderBy: { name: 'asc' }
  });
}

export async function getCharacters(searchQuery?: string) {
  const prisma = await getPrismaClient();
  const universe = await ensureDefaultUniverse();

  return prisma.romanceCharacter.findMany({
    where: { 
      universeId: universe.id,
      ...(searchQuery ? {
        name: {
          contains: searchQuery,
          mode: 'insensitive'
        }
      } : {})
    },
    include: {
      faction: true
    },
    orderBy: { name: 'asc' }
  });
}

export async function addCharacter(data: { name: string; factionId?: string; archetype?: string }) {
  const prisma = await getPrismaClient();
  const universe = await ensureDefaultUniverse();

  const character = await prisma.romanceCharacter.create({
    data: {
      universeId: universe.id,
      name: data.name,
      factionId: data.factionId || null,
      archetype: data.archetype || null,
      aliasesJson: JSON.stringify([]),
    }
  });

  revalidatePath('/romance-lab/forge');
  return character;
}
