import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function StoryboardSandboxPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const projectId = searchParams.project;

  if (projectId) {
    redirect(`/storyboards/builder?project=${projectId}`);
  } else {
    redirect("/storyboards/builder");
  }
}
