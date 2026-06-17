import { getPrismaClient } from './apps/quipsly/src/lib/prisma';
const prisma = getPrismaClient();

async function main() {
  const doc = await prisma.studioDocument.findFirst({
    where: { title: "Learning to Lead - High Ground Odyssey" },
    include: { blocks: { orderBy: { order: 'asc' } } }
  });
  if (doc) {
    console.log(`Document has ${doc.blocks.length} blocks:`);
    doc.blocks.forEach(b => console.log(`[${b.order}] ${b.title}: ${b.body.length} chars`));
  } else {
    console.log("Document not found!");
  }
}
main().catch(console.error);
