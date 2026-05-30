import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as Y from "yjs";
// We need to query raw SQL since StudioManuscriptCollaborationRoom isn't in Prisma schema
const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const episodeId = params.id;
    
    // The collab server uses roomName = 'episode-{id}' or similar
    // Let's assume roomName is just the episodeId for now
    const result: any[] = await prisma.$queryRaw`
      SELECT "ydocState" 
      FROM "StudioManuscriptCollaborationRoom" 
      WHERE "roomName" = ${episodeId}
    `;
    
    if (!result || result.length === 0 || !result[0].ydocState) {
      return NextResponse.json({ text: "No show notes found for this episode." });
    }
    
    const state = result[0].ydocState;
    
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(state));
    
    // The Yjs document likely has an xmlFragment or text node called 'prosemirror' or 'default'
    // This depends on the TipTap/ProseMirror configuration. Usually it's 'default'.
    const xmlFragment = ydoc.getXmlFragment("prosemirror");
    
    // Very rudimentary extraction of text. In a real app we'd use y-prosemirror
    // or just toString() if it's plain text.
    let text = xmlFragment.toString();
    
    // Strip XML tags for basic teleprompter view
    text = text.replace(/<[^>]*>?/gm, "\n");
    
    if (!text.trim()) {
       // Fallback to a standard YText if prosemirror isn't used
       text = ydoc.getText("default").toString();
    }
    
    return NextResponse.json({ text: text || "Manuscript is empty." });
    
  } catch (error) {
    console.error("Error fetching manuscript snapshot:", error);
    return NextResponse.json(
      { error: "Failed to fetch manuscript." },
      { status: 500 }
    );
  }
}
