"use server";

import { getPrismaClient } from "@/lib/prisma";

export async function ensureDefaultSeries() {
  const prisma = await getPrismaClient();

  // Get the universe created by Forge actions, or create it
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
  }

  const seriesCount = await prisma.romanceSeries.count({
    where: { universeId: universe.id }
  });

  if (seriesCount === 0) {
    const defaultSeries = [
      { title: "The Hollows", description: "Shifter Stories", icon: "🐺" },
      { title: "The Old Blood", description: "Vampire Stories", icon: "🦇" },
      { title: "The Hearthstone Circle", description: "Witch Stories", icon: "🔮" },
      { title: "The Bluffs", description: "Fae Stories", icon: "🧚" },
      { title: "The Unmoored", description: "Ghost & Misfit Stories", icon: "👻" },
      { title: "The Chimera Collective", description: "Hybrid Stories", icon: "🧬" }
    ];

    for (const s of defaultSeries) {
      await prisma.romanceSeries.create({
        data: {
          universeId: universe.id,
          title: s.title,
          description: s.description,
          icon: s.icon,
          books: {
            create: [
              { title: `Book 1 of ${s.title}`, bookNumber: 1, tropesJson: JSON.stringify(["Enemies to Lovers"]), leadsJson: JSON.stringify(["Lead A", "Lead B"]) },
              { title: `Book 2 of ${s.title}`, bookNumber: 2, tropesJson: JSON.stringify(["Fake Dating"]), leadsJson: JSON.stringify(["Lead C", "Lead D"]) }
            ]
          }
        }
      });
    }
  }
}

export async function getSeriesWithBooks() {
  const prisma = await getPrismaClient();
  await ensureDefaultSeries();

  const universe = await prisma.romanceUniverse.findFirst({
    where: { name: "The Thornfield Files" }
  });

  if (!universe) return [];

  return prisma.romanceSeries.findMany({
    where: { universeId: universe.id },
    include: {
      books: {
        orderBy: { bookNumber: 'asc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}
