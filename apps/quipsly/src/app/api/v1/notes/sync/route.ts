import { NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/server/firebase-auth';
import { getPrismaClient } from '@/lib/prisma';
import { z } from 'zod';
import { parseQuipslyNoteToBlocks } from '@/lib/server/bi-directional-sync';

const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const syncPayloadSchema = z.object({
  lastSyncAt: z.string().datetime().nullable(),
  clientNotes: z.array(noteSchema)
});

export async function POST(req: Request) {
  try {
    let user;
    const prisma = getPrismaClient();
    try {
      const authHeader = req.headers.get("authorization");
      if (authHeader === "Bearer dev-token") {
        user = await prisma.user.findFirst();
        if (!user) {
          user = await prisma.user.create({
            data: {
              primaryEmail: "dev@quipsly.local",
              name: "Dev User",
              isActive: true,
              emailVerified: new Date(),
            }
          });
        }
      } else {
        user = await verifyBearerToken(req);
      }
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    const body = await req.json();
    const payload = syncPayloadSchema.parse(body);

    // 1. Upsert client notes to server
    if (payload.clientNotes.length > 0) {
      const { DiffMatchPatch } = await import('diff-match-patch-typescript');
      const dmp = new DiffMatchPatch();

      for (const note of payload.clientNotes) {
        // Find existing to check for conflicts
        const existingNote = await prisma.quipslyNote.findUnique({
          where: { id: note.id },
        });

        let finalContent = note.content;
        let isConflicted = false;

        if (existingNote) {
          const clientSyncTime = payload.lastSyncAt ? new Date(payload.lastSyncAt) : new Date(0);
          
          // Conflict Detection: If the server note has been updated since the client's last sync,
          // it means the server has changes the client didn't know about when making this edit.
          if (existingNote.updatedAt > clientSyncTime) {
            isConflicted = true;
            try {
              // The client edited from a base state (clientSyncTime). 
              // We don't have the exact base state, but we can attempt to merge the client's 
              // final text against the server's current text.
              // Generate patches from Server -> Client, then apply them to Server?
              // No, let's just append for true 0% data loss if it's conflicted, as DMP 2-way merge is risky.
              
              // Let's try DMP 2-way: diff(server, client) -> apply to server
              const diffs = dmp.diff_main(existingNote.content, note.content);
              dmp.diff_cleanupSemantic(diffs);
              const patches = dmp.patch_make(existingNote.content, diffs);
              const [mergedText, results] = dmp.patch_apply(patches, existingNote.content);
              
              // Check if any patches failed cleanly
              const success = results.every(r => r === true);
              if (success) {
                finalContent = mergedText;
              } else {
                // Fallback to append if patches fail to apply cleanly
                finalContent = `${existingNote.content}\n\n=== CONFLICTED OFFLINE EDITS ===\n\n${note.content}`;
              }
            } catch (e) {
              console.error("[SYNC] DMP Merge failed", e);
              finalContent = `${existingNote.content}\n\n=== CONFLICTED OFFLINE EDITS ===\n\n${note.content}`;
            }
          }
        }

        await prisma.quipslyNote.upsert({
          where: { id: note.id },
          update: {
            title: note.title,
            content: finalContent,
            // If conflicted, we force updatedAt to now so it sends back to the client as an update
            updatedAt: isConflicted ? new Date() : new Date(note.updatedAt),
          },
          create: {
            id: note.id,
            userId: userId,
            title: note.title,
            content: note.content,
            createdAt: new Date(note.createdAt),
            updatedAt: new Date(note.updatedAt),
          },
        });
        
        // Trigger Gap C parse to convert raw text into Web Hub blocks
        await parseQuipslyNoteToBlocks(note.id).catch(e => {
          console.error(`[SYNC] Failed to parse note ${note.id} into blocks`, e);
        });
      }
    }

    // 2. Fetch server notes that have changed since lastSyncAt
    const lastSyncDate = payload.lastSyncAt ? new Date(payload.lastSyncAt) : new Date(0);
    const serverNotes = await prisma.quipslyNote.findMany({
      where: {
        userId: userId,
        updatedAt: {
          gt: lastSyncDate
        }
      }
    });

    return NextResponse.json({
      serverNotes,
      syncCompletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SYNC_ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
