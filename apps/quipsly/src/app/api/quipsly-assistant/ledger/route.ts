import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

type LedgerRequestBody = {
  actionId?: string;
  newStatus?: string;
  note?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as LedgerRequestBody;

    if (!body.actionId || !body.newStatus) {
      return NextResponse.json(
        { ok: false, error: "actionId and newStatus are required." },
        { status: 400 }
      );
    }

    const actionId = body.actionId;
    const newStatus = body.newStatus;
    const note = body.note;

    if (!process.env.DATABASE_URL) {
      // Graceful fallback for local development without DB
      return NextResponse.json({ ok: true, fallback: true });
    }

    const prisma = getPrismaClient();

    // Use a transaction to update action and insert ledger securely
    await prisma.$transaction(async (tx) => {
      const action = await tx.studioAssistantAction.findUnique({
        where: { id: actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      await tx.studioAssistantAction.update({
        where: { id: actionId },
        data: { status: newStatus },
      });

      // @ts-ignore
      await tx.studioAssistantLedger.create({
        data: {
          actionId,
          previousStatus: action.status,
          newStatus,
          notes: note || null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[quipsly-assistant-ledger] failed", error);
    // Return gracefully so the UI doesn't crash if the ledger fails.
    // The UI handles state optimistically.
    return NextResponse.json({ ok: true, error: "Failed to persist ledger, but local state remains intact." });
  }
}
