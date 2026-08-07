import "server-only";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";

export type SourceStoryActor = {
  userId: string;
  email: string;
  projectId: string;
};

export async function requireSourceStoryAccess(
  request: Request,
  projectSlug: string,
  action: StudioProjectAccessAction,
): Promise<SourceStoryActor> {
  const session = await getQuipslySessionFromRequest(request);
  const email = normalizeAccessEmail(session?.user.primaryEmail || session?.user.email);
  if (!session?.user.id || !email) {
    throw Object.assign(new Error("Sign in to open this source workspace."), { status: 401 });
  }
  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) throw Object.assign(new Error("This source workspace is unavailable."), { status: 404 });
  const access = await resolveStudioProjectAccess({ projectSlug, email, action, prisma });
  if (!access.allowed || !access.projectId) {
    throw Object.assign(new Error("This source workspace is unavailable."), { status: 404 });
  }
  return { userId: session.user.id, email, projectId: access.projectId };
}
