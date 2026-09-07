import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
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
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href={`/nests/${encodeURIComponent(slug)}`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline">Back to {project.name}</Link>
        <h1 className="font-serif text-3xl font-semibold text-foreground">
          {project.name}
        </h1>
      </div>
      <div className="min-w-0">
        <WorkspaceClient 
          key={actorUserId}
          projectSlug={slug}
          projectName={project.name}
          canPost={access.role !== null && roleAllowsAction(access.role, "write")}
        />
      </div>
    </div>
  );
}
