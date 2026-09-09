import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { retryCoachingWorkTransaction } from "./coaching-work-transaction";
import { WORK_TAG_LINKS_SELECT } from "./coaching-work-projection";
import { nestMemberProjectWhere } from "./task-access";
import { parseWorkTagSelection, resolveReusableProjectTag } from "./work-tags";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class NestConversationTaskError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** One canonical task, with its source and tags committed atomically. The
 * default Nest conversation is shared with the Nest; private Session/client
 * conversations must use their own authorized application commands. */
export async function createNestConversationTask(input: {
  prisma: PrismaClient; actorUserId: string; projectSlug: string;
  messageId: string; title: string; clientRequestId: string; tagIds: string[]; newTagLabels?: string[];
}) {
  const { prisma, actorUserId, projectSlug, messageId } = input;
  const title = input.title.replace(/\s+/g, " ").trim();
  const clientRequestId = input.clientRequestId.toLowerCase();
  const tagIds = [...new Set(input.tagIds)].sort();
  const selection = parseWorkTagSelection({ tagIds, newTagLabels: input.newTagLabels });
  if (!actorUserId || !projectSlug || projectSlug.length > 200 || !/^[a-zA-Z0-9_-]{1,240}$/.test(messageId)
    || !title || title.length > 500 || !UUID.test(clientRequestId) || tagIds.length > 24
    || !selection || tagIds.length !== input.tagIds.length || tagIds.some(id => !/^[a-zA-Z0-9_-]{1,200}$/.test(id))) {
    throw new NestConversationTaskError("Choose a message, task title, and valid tags.", 400);
  }
  const id = `nest-task-${createHash("sha256").update(JSON.stringify([actorUserId, clientRequestId])).digest("hex").slice(0, 32)}`;
  const newTagLabels = selection.newTagLabels.sort();
  const fingerprint = createHash("sha256").update(JSON.stringify([
    projectSlug, messageId, title, tagIds, ...(newTagLabels.length ? [newTagLabels] : []),
  ])).digest("hex");
  return retryCoachingWorkTransaction(() => prisma.$transaction(async tx => {
    // Slugs are not globally unique in the old model. Reject ambiguity rather
    // than choosing the first matching Nest, including on request replay.
    const projects = await tx.studioProject.findMany({ where: { slug: projectSlug }, take: 2, select: { id: true } });
    const project = projects.length === 1 ? await tx.studioProject.findFirst({
      where: { id: projects[0].id, ...nestMemberProjectWhere(actorUserId, "write") }, select: { id: true },
    }) : null;
    if (!project) throw new NestConversationTaskError("This Nest isn't available to edit.", 404);
    const message = await tx.studioNestChatMessage.findFirst({
      where: { id: messageId, projectId: project.id, thread: { projectId: project.id, key: "default" } },
      select: { id: true, body: true, threadId: true, updatedAt: true },
    });
    if (!message) throw new NestConversationTaskError("This conversation message isn't available.", 404);
    const select = { id: true, title: true, status: true, sourceJson: true, tagLinks: WORK_TAG_LINKS_SELECT } as const;
    const previous = await tx.actionItem.findUnique({ where: { id }, select });
    if (previous) {
      const source = previous.sourceJson as Record<string, unknown>;
      if (source.requestFingerprint !== fingerprint) throw new NestConversationTaskError("This task request already saved different changes. Try again.", 409);
      return { ...taskResult(previous), idempotentReplay: true };
    }
    const validTags = await tx.studioTag.count({ where: { id: { in: tagIds }, projectId: project.id, isActive: true } });
    if (validTags !== tagIds.length) throw new NestConversationTaskError("A selected tag is no longer available in this Nest.", 409);
    const resolvedTagIds = new Set(tagIds);
    for (const label of newTagLabels) {
      // Membership was checked in this same transaction. Use the canonical
      // resolver so aliases and existing colors survive inline task creation.
      const resolved = await resolveReusableProjectTag({ tx, projectId: project.id, label });
      if (!resolved.ok) throw new NestConversationTaskError(resolved.error, resolved.code === "INVALID_INPUT" ? 400 : 409);
      resolvedTagIds.add(resolved.tag.id);
    }
    const task = await tx.actionItem.create({ data: {
      id, projectId: project.id, isNestShared: true, title, detail: message.body,
      sourceJson: { schema: "quipsly-nest-work-v1", createdByUserId: actorUserId,
        clientRequestId, requestFingerprint: fingerprint, origin: "conversation",
        conversationSource: { schema: "quipsly-conversation-work-v1", projectId: project.id,
          threadKey: "default", threadId: message.threadId, messageId, excerpt: message.body,
          messageUpdatedAt: message.updatedAt.toISOString() } },
      tagLinks: { create: [...resolvedTagIds].sort().map(tagId => ({ tagId })) },
    }, select });
    return { ...taskResult(task), idempotentReplay: false };
  }, { isolationLevel: "Serializable" }));
}

function taskResult(task: { id: string; title: string; status: string; tagLinks: { tag: { id: string; label: string; hexColor: string | null; isActive: boolean } }[] }) {
  return { entry: { id: task.id, title: task.title, status: task.status, tags: task.tagLinks.map(link => link.tag) } };
}
