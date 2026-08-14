import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
import { WorkspaceClient } from "./WorkspaceClient";

export const dynamic = "force-dynamic";

type NestWorkspacePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function NestWorkspacePage({ params }: NestWorkspacePageProps) {
  const { slug } = await params;
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  const actorUserId = session?.user?.id;

  if (!actorEmail || !actorUserId) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/nests/${slug}/workspace`)}`);
  }

  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actorEmail,
    action: "read",
  });
  
  if (!access.allowed) notFound();

  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(slug, prisma);
  
  if (!project) notFound();

  return (
    <div className="flex h-[calc(100vh-64px)] w-full flex-col overflow-hidden bg-[#fffaf0]">
      <div className="flex-none border-b border-[#e3d4b9] bg-white px-6 py-4">
        <h1 className="font-serif text-2xl font-black text-[#3d3122]">
          {project.name} Workspace
        </h1>
        <p className="text-sm font-semibold text-[#765f40]">
          Unified cyborg collaboration environment
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <WorkspaceClient 
          projectId={project.id}
          projectSlug={slug}
          projectName={project.name}
          actorUserId={actorUserId}
        />
      </div>
    </div>
  );
}
