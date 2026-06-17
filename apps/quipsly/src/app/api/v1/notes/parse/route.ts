import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { z } from 'zod';

const parsePayloadSchema = z.object({
  documentId: z.string(), // The Postgres StudioDocument ID
  rawText: z.string(),
});

export async function POST(req: Request) {
  try {
    // In production, verify this is triggered securely (e.g., webhook secret)
    const body = await req.json();
    const payload = parsePayloadSchema.parse(body);

    const prisma = getPrismaClient();

    // 1. Parse continuous text into blocks by double newlines
    const rawBlocks = payload.rawText.split(/\n\s*\n/).filter(b => b.trim().length > 0);

    // 2. We could do a complex diff/merge, but for MVP we clear and recreate
    // This is naive and will destroy block IDs, but proves the concept.
    await prisma.$transaction(async (tx) => {
      // Clear existing blocks for this document
      await tx.studioDocumentBlock.deleteMany({
        where: { documentId: payload.documentId }
      });

      // Insert new blocks
      const blocksToInsert = rawBlocks.map((bodyText, index) => {
        // Detect if it's a heading (e.g. "# Chapter 1")
        const isHeading = bodyText.trim().startsWith('#');
        let title = null;
        let cleanBody = bodyText.trim();
        
        if (isHeading) {
            title = cleanBody.replace(/^#+\s*/, '');
        }

        return {
          documentId: payload.documentId,
          stableId: `block-${Date.now()}-${index}`,
          order: index * 1000,
          title: title,
          body: cleanBody,
          isPrivate: false,
        };
      });

      if (blocksToInsert.length > 0) {
        await tx.studioDocumentBlock.createMany({
          data: blocksToInsert
        });
      }
    });

    return NextResponse.json({ success: true, blockCount: rawBlocks.length });
  } catch (error) {
    console.error('[PARSE_ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
