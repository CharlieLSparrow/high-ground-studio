import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function StoryboardSandboxPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const params = await searchParams;
  const projectId = params.project;

  if (projectId) {
    redirect(`/storyboards/builder?project=${projectId}`);
  } else {
    redirect("/storyboards/builder");
  }
}
