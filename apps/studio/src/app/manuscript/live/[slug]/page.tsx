import { notFound } from "next/navigation";

import { StudioAccessShell } from "@/app/studio-access-shell";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { normalizeStudioManuscriptLiveSlug } from "@/lib/server/studio-manuscript-snapshots";

import { StudioManuscriptClient } from "../../studio-manuscript-client";

export const dynamic = "force-dynamic";

export default async function StudioManuscriptLivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const slug = normalizeStudioManuscriptLiveSlug(resolvedParams.slug);

  if (!slug) {
    notFound();
  }

  const access = await getStudioAccessState();
  const redirectTo = `/manuscript/live/${slug}`;

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" redirectTo={redirectTo} />;
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel || undefined}
        roles={access.roles}
      />
    );
  }

  return (
    <StudioManuscriptClient
      actor={{
        primaryEmail: access.actorLabel,
      }}
      initialLiveSnapshotSlug={slug}
    />
  );
}
