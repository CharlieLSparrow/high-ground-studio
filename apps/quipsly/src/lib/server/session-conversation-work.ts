import "server-only";
import type { Prisma } from "@prisma/client";

/** The caller has already checked Session conversation access. Return only
 * tasks shared with that conversation, never private work linked to its text. */
export async function sessionConversationTasks(
  prisma: Pick<Prisma.TransactionClient, "actionItem">,
  roomId: string,
  messageIds: string[],
) {
  const result = new Map<string, {id: string; title: string; status: string}[]>();
  if (!messageIds.length) return result;
  const tasks = await prisma.actionItem.findMany({
    where: {roomId, AND: [
      {sourceJson: {path: ["schema"], equals: "quipsly-session-work-entry-v1"}},
      {sourceJson: {path: ["visibility"], equals: "SESSION_SHARED"}},
      {OR: messageIds.map(id => ({sourceJson: {path: ["sourceMessageId"], equals: id}}))},
    ]},
    select: {id: true, title: true, status: true, sourceJson: true},
    orderBy: {createdAt: "asc"},
  });
  for (const task of tasks) {
    const source = task.sourceJson as Record<string, unknown> | null;
    const removal = source?.relationshipWorkRemoval as {active?: boolean} | undefined;
    if (removal?.active || typeof source?.sourceMessageId !== "string") continue;
    const linked = result.get(source.sourceMessageId) || [];
    linked.push({id: task.id, title: task.title, status: task.status});
    result.set(source.sourceMessageId, linked);
  }
  return result;
}
