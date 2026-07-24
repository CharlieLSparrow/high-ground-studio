import Link from "next/link";
import { ArrowLeft, HardDriveDownload } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { findStudioProjectForAccess, normalizeAccessEmail, resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { NestPortabilityClient } from "./NestPortabilityClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nest backup and transfer - Quipsly",
  description: "Export and safely restore a verified Quipsly Nest package.",
};

export default async function NestPortabilityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  if (!actorEmail || !session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/nests/${slug}/portable`)}`);
  }
  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actorEmail,
    action: "manage",
  });
  if (!access.allowed || !access.projectId) notFound();
  const project = await findStudioProjectForAccess(slug);
  if (!project || project.id !== access.projectId) notFound();

  return (
    <main className="min-h-full bg-[#fdfaf6] px-3 py-5 text-[#3d3122] sm:px-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/nests/${encodeURIComponent(project.slug)}?view=tools`}
          className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-wide text-[#795a35] hover:underline"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to {project.name}
        </Link>
        <header className="mt-3 rounded-[2rem] border border-[#e3d4b9] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-[#f7eddb] p-3 text-[#795a35]"><HardDriveDownload size={26} aria-hidden="true" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a653d]">Owner controls</p>
              <h1 className="mt-1 font-serif text-4xl font-black tracking-tight md:text-5xl">Backup and transfer</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715f48]">
                Keep {project.name} portable without turning recovery into a destructive database copy. Export is
                inspectable JSON; restore previews every create, reuse, deferral, and collision before it can write.
              </p>
            </div>
          </div>
        </header>
        <div className="mt-6">
          <NestPortabilityClient projectSlug={project.slug} projectName={project.name} />
        </div>
      </div>
    </main>
  );
}
