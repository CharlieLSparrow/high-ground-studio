import type { Prisma } from "@prisma/client";
import { personalOrSharedSessionTaskAccessWhere } from "./task-access";

/** The queue and its controls use the same policy as task mutations. Being in
 * a Session does not make every participant's personal tasks shared. */
export function workQueueTaskWhere(userId: string): Prisma.ActionItemWhereInput {
  return { OR: personalOrSharedSessionTaskAccessWhere(userId) };
}

export async function readEditableWorkQueueTaskIds(
  prisma: Pick<Prisma.TransactionClient, "actionItem">,
  userId: string,
  taskIds: string[],
): Promise<Set<string>> {
  if (!taskIds.length) return new Set();
  const rows = await prisma.actionItem.findMany({
    where: { id: { in: taskIds }, OR: personalOrSharedSessionTaskAccessWhere(userId, "write") },
    select: { id: true },
  });
  return new Set(rows.map(row => row.id));
}
