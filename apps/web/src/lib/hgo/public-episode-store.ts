import fs from "node:fs/promises";
import path from "node:path";

import episode1 from "../../../content/publish/hgo-episodes/episode-1-write-it-down.json";
import episode2 from "../../../content/publish/hgo-episodes/episode-2-look-for-lessons.json";
import episode3 from "../../../content/publish/hgo-episodes/episode-3-chub-and-jack.json";
import bundledIndex from "../../../content/publish/hgo-episodes/episodes-index.json";
import {
  parseHgoPublicEpisodePacket,
  validateHgoPublicEpisodePacket,
  type HgoPublicEpisodeIndexEntry,
  type HgoPublicEpisodePacket,
} from "@/lib/hgo/public-episode-packet";

const bundledPackets = [episode1, episode2, episode3]
  .map((packet) => validateHgoPublicEpisodePacket(packet))
  .flatMap((result) => (result.ok ? [result.packet] : []));

const bundledPacketBySlug = new Map(
  bundledPackets.map((packet) => [packet.slug, packet] as const),
);

function contentDirCandidates() {
  return [
    path.join(process.cwd(), "content/publish/hgo-episodes"),
    path.join(process.cwd(), "apps/web/content/publish/hgo-episodes"),
    path.join(process.cwd(), "../../apps/web/content/publish/hgo-episodes"),
  ];
}

function episodeSortValue(packet: Pick<HgoPublicEpisodePacket, "episodeNumber">) {
  const parsed = Number.parseFloat(packet.episodeNumber);
  if (Number.isFinite(parsed)) return parsed;
  return Number.MAX_SAFE_INTEGER;
}

function normalizePacketJson(value: unknown): HgoPublicEpisodePacket | null {
  const parsed = typeof value === "string"
    ? parseHgoPublicEpisodePacket(value)
    : validateHgoPublicEpisodePacket(value);

  return parsed.ok ? parsed.packet : null;
}

async function readFileEpisodePacket(slug: string) {
  for (const dir of contentDirCandidates()) {
    try {
      const raw = await fs.readFile(path.join(dir, `${slug}.json`), "utf8");
      const parsed = parseHgoPublicEpisodePacket(raw);
      if (parsed.ok) return parsed.packet;
    } catch {
      // Try the next deployment/runtime layout.
    }
  }

  return null;
}

async function readFileEpisodeIndex() {
  for (const dir of contentDirCandidates()) {
    try {
      const raw = await fs.readFile(path.join(dir, "episodes-index.json"), "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as HgoPublicEpisodeIndexEntry[];
    } catch {
      // Try the next deployment/runtime layout.
    }
  }

  return bundledIndex as HgoPublicEpisodeIndexEntry[];
}

async function readDatabaseEpisodePacket(slug: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const candidate = await prisma.hgoEpisodePublishCandidate.findFirst({
      where: {
        projectionSlug: slug,
        candidateStatus: "published",
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        packetJson: true,
        draftPacketJson: true,
      },
    });

    if (!candidate) return null;
    return normalizePacketJson(candidate.draftPacketJson) ?? normalizePacketJson(candidate.packetJson);
  } catch {
    return null;
  }
}

async function listDatabaseEpisodePackets() {
  try {
    const { prisma } = await import("@/lib/prisma");
    const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
      where: {
        candidateStatus: "published",
        archivedAt: null,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 24,
      select: {
        packetJson: true,
        draftPacketJson: true,
      },
    });

    return candidates
      .map((candidate) => normalizePacketJson(candidate.draftPacketJson) ?? normalizePacketJson(candidate.packetJson))
      .filter((packet): packet is HgoPublicEpisodePacket => Boolean(packet));
  } catch {
    return [];
  }
}

export async function readHgoPublicEpisodePacket(slug: string) {
  return (
    await readDatabaseEpisodePacket(slug) ??
    await readFileEpisodePacket(slug) ??
    bundledPacketBySlug.get(slug) ??
    null
  );
}

export async function listHgoPublicEpisodePackets() {
  const packets = new Map<string, HgoPublicEpisodePacket>();

  for (const packet of bundledPackets) {
    packets.set(packet.slug, packet);
  }

  const index = await readFileEpisodeIndex();
  for (const entry of index) {
    const packet = await readFileEpisodePacket(entry.slug);
    if (packet) packets.set(packet.slug, packet);
  }

  for (const packet of await listDatabaseEpisodePackets()) {
    packets.set(packet.slug, packet);
  }

  return Array.from(packets.values()).sort((a, b) => {
    const episodeDelta = episodeSortValue(a) - episodeSortValue(b);
    if (episodeDelta !== 0) return episodeDelta;
    return a.title.localeCompare(b.title);
  });
}
