import { getPrismaClient } from "@/lib/prisma";
import { SidebarLayout } from "@/components/SidebarLayout";
import Link from "next/link";
import { Plus, Folder, Clock } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

async function createProject(formData: FormData) {
  "use server";
  const name = formData.get("name") as string;
  if (!name) return;

  const prisma = getPrismaClient();
  
  // Find or create default workspace for now
  const WORKSPACE_SLUG = "tonight-pack";
  let workspace = await prisma.studioWorkspace.findUnique({
    where: { slug: WORKSPACE_SLUG }
  });

  if (!workspace) {
    workspace = await prisma.studioWorkspace.create({
      data: { slug: WORKSPACE_SLUG, name: "Tonight Pack Workspace" }
    });
  }

  function slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "untitled";
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.studioProject.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  await prisma.studioProject.create({
    data: {
      workspaceId: workspace.id,
      slug,
      name,
    }
  });

  revalidatePath("/projects");
  redirect(`/create?project=${slug}`);
}

export default async function ProjectsHub() {
  const prisma = getPrismaClient();

  const projects = await prisma.studioProject.findMany({
    include: { workspace: true, scenes: true },
    orderBy: { updatedAt: "desc" }
  });

  return (
    <SidebarLayout>
      <div className="p-8 max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Studio Projects</h1>
            <p className="text-zinc-500 mt-2 text-lg">Manage your unified projects, storyboards, and scripts.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(project => (
                <Link
                  key={project.id}
                  href={`/create?project=${project.slug}`}
                  className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 hover:shadow-md transition-all hover:border-indigo-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                      <Folder size={24} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1 group-hover:text-indigo-600 transition-colors">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-zinc-500 mt-4">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                      {project.scenes.length} Scenes
                    </span>
                  </div>
                </Link>
              ))}
              
              {projects.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-zinc-200 rounded-2xl">
                  <p className="text-zinc-500 font-medium">No projects found. Create one to get started.</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sticky top-6">
              <h2 className="text-xl font-bold mb-4">Create New Project</h2>
              <form action={createProject} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    placeholder="E.g., Scene 4: The Showdown"
                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-transparent dark:text-white outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-3 rounded-xl transition-colors"
                >
                  <Plus size={18} />
                  Create Project
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
