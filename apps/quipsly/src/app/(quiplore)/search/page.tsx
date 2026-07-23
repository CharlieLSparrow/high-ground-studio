import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SemanticSearchClient } from "./SemanticSearchClient";

export const dynamic = "force-dynamic";

export default async function QuipLoreSearchPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/search");
  }

  const { project } = await searchParams;
  const projectId = project || "";

  return (
    <main className="min-h-screen bg-[#fdfaf6] p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-serif text-4xl font-black text-[#3d3122]">QuipLore Semantic Search</h1>
        <p className="mt-2 text-[#6b5b45]">
          Find mathematically similar quotes using high-dimensional AI vector embeddings.
        </p>
        <div className="mt-8">
          <SemanticSearchClient projectId={projectId} />
        </div>
      </div>
    </main>
  );
}
