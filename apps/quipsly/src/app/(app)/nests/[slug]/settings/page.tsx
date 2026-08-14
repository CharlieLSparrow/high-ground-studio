import { getPrismaClient } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { SettingsClient } from "./settings-client";

export default async function NestSettingsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await getQuipslySession();
  if (!session?.user?.email) return notFound();

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: params.slug,
    email: session.user.email,
    action: "write",
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return notFound();
  }

  const project = await prisma.studioProject.findUnique({
    where: { id: access.projectId },
    select: {
      id: true,
      slug: true,
      name: true,
      tags: {
        where: { isActive: true },
        select: {
          id: true,
          label: true,
          hexColor: true,
          category: true,
          uiCategory: true,
        },
        orderBy: { label: "asc" },
      },
      workflowStages: {
        select: {
          id: true,
          name: true,
          hexColor: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!project) return notFound();

  return (
    <div className="flex flex-col gap-6 w-full p-4 md:p-8 max-w-[1200px] mx-auto">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-studio-ink">Nest Settings</h1>
        <p className="text-studio-muted">
          Manage workflow stages and custom tags for <strong>{project.name}</strong>.
        </p>
      </header>

      <SettingsClient
        project={project}
        initialStages={project.workflowStages}
        initialTags={project.tags}
      />
    </div>
  );
}
