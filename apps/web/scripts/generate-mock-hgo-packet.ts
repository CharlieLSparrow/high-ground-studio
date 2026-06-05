import fs from "node:fs/promises";
import path from "node:path";
import { HgoPublicEpisodePacket, HGO_PUBLIC_EPISODE_PACKET_KIND } from "../src/lib/hgo/public-episode-packet";

async function generateMockPacket() {
  const packet: HgoPublicEpisodePacket = {
    packetKind: HGO_PUBLIC_EPISODE_PACKET_KIND,
    id: "mock-episode-1234",
    slug: "010-the-art-of-letting-go",
    title: "The Art of Letting Go",
    subtitle: "A journey into surrender",
    episodeNumber: "010",
    summary: "In this episode, we explore the difficult but necessary process of letting go of past attachments to make room for new growth. Featuring insights from psychological research and personal anecdotes.",
    publishStatus: "live",
    hero: {
      eyebrow: "Psychology",
      colorMood: "amber",
      assetUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&q=80&w=2000"
    },
    media: {
      heroImageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    showNotes: {
      beats: [
        { title: "Introduction to Agentic Frameworks", summary: "We discuss the rise of self-directed AI actors and the shift from prompt engineering to goal orchestration.", timingHint: "00:00 - 12:30" },
        { title: "The State of the Tool Use", summary: "Examining how models interface with the physical and digital world through tightly typed tool schemas.", timingHint: "12:30 - 34:15" },
        { title: "Multi-Agent Coordination", summary: "How multiple agents negotiate task breakdown, memory sharing, and handoffs.", timingHint: "34:15 - End" },
      ],
      voiceCards: [
        { speaker: "Charlie", summary: "Charlie explores the theoretical bounds of recursive intelligence." },
        { speaker: "Homer", summary: "Homer provides practical grounding on exactly how these systems fail in production environments." }
      ]
    },
    quotes: [
      { text: "We are no longer writing programs; we are writing the organizational charts for synthetic employees.", attribution: "Charlie" },
      { text: "Every tool you give an agent is another vector for unpredictable state mutations.", attribution: "Homer" }
    ],
    essayVersion: `### The Dawn of Agentic Workflows\n\nThe fundamental shift in software engineering over the next decade will not be a new language or framework, but rather the abstraction of execution itself. \n\nWe spent the 2010s defining declarative UIs. We will spend the 2030s defining declarative organizational goals.\n\nWhen you give a system a *goal* instead of a *routine*, you must simultaneously equip it with a robust set of tools and a safe environment to explore state space. This is where Quipsly's architecture shines.`,
    provenance: {
      sourceArtifactHash: "sha256-mock-hash-12345",
      publishedAt: new Date().toISOString()
    }
  };

  const outDir = path.join(process.cwd(), "content", "publish", "hgo-episodes");
  await fs.mkdir(outDir, { recursive: true });
  
  const outFile = path.join(outDir, "test-episode.json");
  await fs.writeFile(outFile, JSON.stringify(packet, null, 2), "utf8");

  // Maintain index
  const indexPath = path.join(outDir, "episodes-index.json");
  let index: Record<string, any> = {};
  try {
    const indexContent = await fs.readFile(indexPath, "utf8");
    index = JSON.parse(indexContent);
  } catch (e) {}

  index[packet.slug] = {
    id: packet.id,
    slug: packet.slug,
    title: packet.title,
    episodeNumber: packet.episodeNumber,
    summary: packet.summary,
    publishedAt: packet.provenance.publishedAt,
  };

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  
  console.log(`Successfully wrote mock packet and updated index at ${outDir}`);
}

generateMockPacket().catch(console.error);
