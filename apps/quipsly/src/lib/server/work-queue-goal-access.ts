import type { Prisma } from "@prisma/client";
import { personalOrSharedCoachingGoalAccessWhere, sharedCoachingWorkVisibilityWhere } from "./coaching-work-access";
import { sessionActorAccessWhere } from "./session-access";
import { workQueueTaskWhere } from "./work-queue-task-access";

/** Read production goals through current room access, not a cached list of
 * room IDs. Client-space goals keep their explicit coaching membership. */
export function workQueueGoalWhere(userId: string): Prisma.GoalWhereInput {
  return { OR: [
    ...personalOrSharedCoachingGoalAccessWhere(userId),
    { engagementId: null, bookingId: null, AND: [sharedCoachingWorkVisibilityWhere()],
      room: { is: { coachingEngagementId: null, bookingId: null, AND: [sessionActorAccessWhere({ id: userId })] } } },
  ] };
}

/** Linking work does not share it. Filter each related resource before its
 * identifiers, text, status, or aggregate counts reach any client projection. */
export function workQueueGoalRelations(userId: string) {
  const goalWhere = workQueueGoalWhere(userId);
  return {
    parent: { where: goalWhere, select: { id: true, title: true } },
    taskLinks: { where: { actionItem: { is: workQueueTaskWhere(userId) } }, take: 100,
      select: { relationship: true, actionItem: { select: { id: true, title: true, status: true } } } },
    _count: { select: { children: { where: goalWhere } } },
  } satisfies Prisma.GoalSelect;
}
