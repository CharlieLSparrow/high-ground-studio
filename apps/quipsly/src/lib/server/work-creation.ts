import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { retryCoachingWorkTransaction } from "./coaching-work-transaction";
import { nestMemberProjectWhere } from "./task-access";

export class WorkCreationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "CONFLICT", message: string) { super(message); }
}

type CreationCommand = { clientRequestId: string; fingerprint: string; receiptId: string };
type CreatedWork = { id: string; updatedAt: string; receiptId: string; recurrenceSeriesId?: string; occurrenceCount?: number };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Request identity lives on the canonical item, not a second work queue. A
 * retry returns the saved item without overwriting any subsequent edits. */
export async function createWorkOnce(input: {
  prisma: PrismaClient;
  kind: "task" | "goal";
  actorUserId: string;
  clientRequestId: string;
  projectId: string | null;
  intent: Prisma.InputJsonValue;
  create: (tx: Prisma.TransactionClient, id: string, command: CreationCommand) => Promise<CreatedWork>;
}): Promise<CreatedWork> {
  const clientRequestId = typeof input.clientRequestId === "string" ? input.clientRequestId.toLowerCase() : "";
  if (!input.actorUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId ?? "")) {
    throw new WorkCreationError("INVALID_INPUT", "Refresh this page and try saving again.");
  }
  const id = `work-${input.kind}-${createHash("sha256").update(JSON.stringify([input.actorUserId, clientRequestId])).digest("hex").slice(0, 32)}`;
  const fingerprint = createHash("sha256").update(JSON.stringify([input.projectId, input.intent])).digest("hex");
  return retryCoachingWorkTransaction(() => input.prisma.$transaction(async tx => {
    // Access is checked inside the transaction on every attempt, including replay.
    if (input.projectId && !await tx.studioProject.findFirst({
      where: { id: input.projectId, ...nestMemberProjectWhere(input.actorUserId, "write") }, select: { id: true },
    })) throw new WorkCreationError("INVALID_INPUT", "Choose a Nest that is available to your account.");
    const query = { where: { id }, select: { id: true, updatedAt: true, sourceJson: true } } as const;
    const existing = input.kind === "task" ? await tx.actionItem.findUnique(query) : await tx.goal.findUnique(query);
    if (existing) {
      const source = record(existing.sourceJson);
      const command = record(source.creationCommand);
      if (command.fingerprint !== fingerprint || typeof command.receiptId !== "string") {
        throw new WorkCreationError("CONFLICT", "This save already contains different work. Refresh to see the saved item.");
      }
      return { id: existing.id, updatedAt: existing.updatedAt.toISOString(), receiptId: command.receiptId,
        ...(input.kind === "task" && typeof source.recurrenceSeriesId === "string" && typeof command.occurrenceCount === "number"
          ? { recurrenceSeriesId: source.recurrenceSeriesId, occurrenceCount: command.occurrenceCount } : {}) };
    }
    return input.create(tx, id, { clientRequestId, fingerprint, receiptId: randomUUID() });
  }, { isolationLevel: "Serializable" }));
}
