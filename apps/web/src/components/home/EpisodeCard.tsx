// import { prisma } from "@/lib/db";

export default function EpisodeCard({ episode, variant, layoutVariant }: any) {
  // Stubbed until Prisma is wired up
  return (
    <div className="border border-white/10 p-4 rounded-xl">
      <h3>{episode?.title || "Episode Placeholder"}</h3>
    </div>
  );
}
