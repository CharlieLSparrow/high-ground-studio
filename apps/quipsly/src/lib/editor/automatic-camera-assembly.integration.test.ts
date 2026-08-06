/** @jest-environment node */

jest.mock("server-only", () => ({}));

import type { TimelineState } from "@high-ground/quipsly-domain";
import { assembleSpeakerCameraCut, cameraAssemblyReadiness } from "@high-ground/quipsly-domain";

import { normalizeEpisodeArtifact } from "@/app/(app)/episode-production/episodeArtifact";
import { getPrismaClient } from "@/lib/prisma";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the retained automatic-camera assembly smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("retained High Ground Odyssey automatic camera assembly", () => {
  const prisma = getPrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("projects only episodes with explicit camera identity and reports the retained readiness inventory", async () => {
    const episodes = await prisma.studioEpisodeProduction.findMany({
      where: { project: { slug: { contains: "high-ground", mode: "insensitive" } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, slug: true, title: true, timelineJson: true, project: { select: { slug: true } } },
    });
    expect(episodes.length).toBeGreaterThan(0);
    const inventory = episodes.map((episode) => {
      const artifact = normalizeEpisodeArtifact(episode.timelineJson);
      const timeline: TimelineState | null = artifact ? {
        clips: artifact.timelineClips.map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          kind: clip.kind === "audio" ? "audio" : "video",
          startIn: clip.startIn,
          duration: clip.duration,
          sourceStart: clip.sourceStart,
          sourceEnd: clip.sourceEnd,
          name: clip.name,
          color: clip.color,
          trackId: clip.trackId,
        })),
        transcript: artifact.transcript.map((block) => ({ ...block, speaker: block.speaker ?? null })),
        speakerCameraMappings: artifact.speakerCameraMappings,
        cameraAssemblyPolicy: artifact.cameraAssemblyPolicy,
        cameraSwitchDecisions: artifact.cameraSwitchDecisions,
      } : null;
      const readiness = timeline ? cameraAssemblyReadiness(timeline) : null;
      return {
        episode,
        artifact,
        timeline,
        readiness,
      };
    });
    const eligible = inventory.filter((row) => row.timeline && row.readiness && row.readiness.status !== "blocked" && row.readiness.videoSourceCount >= 2);

    console.info("Retained HGO automatic-camera readiness", inventory.map((row) => ({
      project: row.episode.project.slug,
      episode: row.episode.slug,
      videoClips: row.readiness?.videoSourceCount ?? 0,
      transcriptBlocks: row.readiness?.activeTranscriptBlockCount ?? 0,
      speakers: row.readiness?.speakerCount ?? 0,
      mappings: row.readiness?.mappedSpeakerCount ?? 0,
      status: row.readiness?.status ?? "no-timeline",
      issues: row.readiness?.issues.map((issue) => issue.code) ?? [],
      eligible: eligible.some((candidate) => candidate.episode.id === row.episode.id),
    })));

    if (!eligible.length) {
      expect(inventory.some((row) => row.readiness?.status === "blocked")).toBe(true);
      expect(inventory.every((row) => !row.readiness || row.readiness.status === "blocked" || row.readiness.videoSourceCount < 2)).toBe(true);
      return;
    }
    const selected = eligible[0]!;
    const timeline = selected.timeline!;
    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-07T00:00:00.000Z" });

    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions.every((decision) => timeline.clips.some((clip) => clip.id === decision.targetClipId))).toBe(true);
    expect(result.decisions.every((decision) => decision.status === "draft")).toBe(true);
    expect(result.decisions.every((decision) => decision.evidence.transcriptBlockIds.length > 0 || decision.evidence.assemblyReason === "wide-silence")).toBe(true);
    console.info("Retained HGO automatic-camera projection", {
      project: selected.episode.project.slug,
      episode: selected.episode.slug,
      decisions: result.decisions.length,
      holds: result.holds.length,
      warnings: result.warnings.length,
      policy: result.policy,
    });
  });
});
