import { NextResponse } from "next/server";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_NATIVE_NOTE_SOURCE_LABEL } from "@/lib/server/bi-directional-sync";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

export const runtime = "nodejs";

const MAX_RAW_TEXT_LENGTH = 2_000_000;

const parsePayloadSchema = z.object({
  documentId: z.string().min(1),
  rawText: z.string().max(MAX_RAW_TEXT_LENGTH),
});

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

async function readPayload(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      response: errorResponse(400, "INVALID_JSON", "Send a valid JSON parse payload."),
    };
  }

  const result = parsePayloadSchema.safeParse(body);
  if (!result.success) {
    return {
      response: errorResponse(
        400,
        "INVALID_PARSE_PAYLOAD",
        "The note parse payload is invalid.",
      ),
    };
  }

  return { payload: result.data };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return errorResponse(401, "UNAUTHORIZED", "Sign in before rebuilding note blocks.");
  }

  const parsed = await readPayload(request);
  if (parsed.response) return parsed.response;

  const { payload } = parsed;
  const prisma = getPrismaClient();

  try {
    const ownerEmail = session.user.primaryEmail.trim().toLowerCase();
    const document = await prisma.studioDocument.findFirst({
      where: {
        id: payload.documentId,
        ...personalWritingDocumentVisibilityWhere(session.user.id),
      },
      select: {
        id: true,
        stableId: true,
        sourceLabel: true,
        project: {
          select: {
            sourceLabel: true,
            accessGrants: {
              where: {
                email: ownerEmail,
                role: "OWNER",
                status: "ACTIVE",
              },
              select: { id: true },
            },
          },
        },
      },
    });

    // This endpoint is deliberately narrower than general Studio document
    // editing: it may rebuild only the authenticated user's QuipslyNote
    // projection inside that user's explicitly owned Home Nest. Return one not-found
    // result for missing and inaccessible documents to avoid an ownership oracle.
    if (
      !document ||
      document.sourceLabel !== QUIPSLY_NATIVE_NOTE_SOURCE_LABEL ||
      document.project.sourceLabel !== sourceLabelForNestKind("home") ||
      document.project.accessGrants.length !== 1
    ) {
      return errorResponse(
        404,
        "NOTE_DOCUMENT_NOT_FOUND",
        "That note document is unavailable for this account.",
      );
    }

    const ownedNote = await prisma.quipslyNote.findFirst({
      where: {
        id: document.stableId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!ownedNote) {
      return errorResponse(
        404,
        "NOTE_DOCUMENT_NOT_FOUND",
        "That note document is unavailable for this account.",
      );
    }

    const rawBlocks = payload.rawText
      .split(/\n\s*\n/)
      .filter((block) => block.trim().length > 0);
    const stableIdSeed = Date.now();

    await prisma.$transaction(async (tx) => {
      await tx.studioDocumentBlock.deleteMany({
        where: { documentId: document.id },
      });

      const blocksToInsert = rawBlocks.map((bodyText, index) => {
        const cleanBody = bodyText.trim();
        const isHeading = cleanBody.startsWith("#");

        return {
          documentId: document.id,
          stableId: `block-${stableIdSeed}-${index}`,
          order: index * 1000,
          title: isHeading ? cleanBody.replace(/^#+\s*/, "") : null,
          body: cleanBody,
          isPrivate: true,
        };
      });

      if (blocksToInsert.length > 0) {
        await tx.studioDocumentBlock.createMany({ data: blocksToInsert });
      }
    });

    return NextResponse.json({ ok: true, success: true, blockCount: rawBlocks.length });
  } catch (error) {
    console.error("[PARSE_ERROR]", error);
    return errorResponse(
      500,
      "PARSE_FAILED",
      "The server could not rebuild this note's blocks. No success response was issued.",
    );
  }
}
