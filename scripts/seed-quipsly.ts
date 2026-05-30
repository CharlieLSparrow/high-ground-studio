import { PrismaClient, QuipslyNodeType, QuipslyEdgeType } from "@prisma/client";
import {
  themes,
  people,
  sourceWorks,
  evidence,
  quotes,
  lorelists,
  getAllQuipCards,
} from "../packages/quipsly-domain/src/seed";

import { prisma } from "../apps/web/src/lib/prisma";

async function main() {
  console.log("Seeding Quipsly Graph...");

  // We'll clear existing nodes first for a clean run
  await prisma.quipLoreEdge.deleteMany({});
  await prisma.quipslyNode.deleteMany({});

  // 1. Insert Themes
  for (const theme of themes) {
    await prisma.quipslyNode.create({
      data: {
        id: theme.id,
        slug: theme.slug,
        nodeType: QuipslyNodeType.THEME,
        status: "published",
        payloadJson: JSON.parse(JSON.stringify(theme)),
      },
    });
  }

  // 2. Insert People
  for (const person of people) {
    await prisma.quipslyNode.create({
      data: {
        id: person.id,
        slug: person.slug,
        nodeType: QuipslyNodeType.PERSON,
        status: "published",
        payloadJson: JSON.parse(JSON.stringify(person)),
      },
    });
    
    // Edges for Person -> Theme
    for (const themeId of person.themeIds) {
      await prisma.quipLoreEdge.create({
        data: {
          sourceNodeId: person.id,
          targetNodeId: themeId,
          edgeType: QuipslyEdgeType.HAS_THEME,
        },
      });
    }
  }

  // 3. Insert SourceWorks
  for (const source of sourceWorks) {
    await prisma.quipslyNode.create({
      data: {
        id: source.id,
        slug: source.slug,
        nodeType: QuipslyNodeType.SOURCE_WORK,
        status: "published",
        payloadJson: JSON.parse(JSON.stringify(source)),
      },
    });
  }

  // 4. Insert Quotes
  for (const quote of quotes) {
    await prisma.quipslyNode.create({
      data: {
        id: quote.id,
        slug: quote.slug,
        nodeType: QuipslyNodeType.QUOTE,
        status: quote.verificationStatus === "needs-review" ? "draft" : "published",
        payloadJson: JSON.parse(JSON.stringify(quote)),
      },
    });

    // Edges
    if (quote.personId) {
      await prisma.quipLoreEdge.create({
        data: {
          sourceNodeId: quote.id,
          targetNodeId: quote.personId,
          edgeType: QuipslyEdgeType.QUOTED_BY,
        },
      });
    }

    if (quote.sourceWorkId) {
      await prisma.quipLoreEdge.create({
        data: {
          sourceNodeId: quote.id,
          targetNodeId: quote.sourceWorkId,
          edgeType: QuipslyEdgeType.APPEARS_IN,
        },
      });
    }

    for (const themeId of quote.themeIds) {
      await prisma.quipLoreEdge.create({
        data: {
          sourceNodeId: quote.id,
          targetNodeId: themeId,
          edgeType: QuipslyEdgeType.HAS_THEME,
        },
      });
    }
  }

  console.log("Seeding complete! Indexed nodes and edges.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
