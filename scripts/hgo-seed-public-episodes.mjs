#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "apps/web/content/_inbox");
const outputDir = path.join(repoRoot, "apps/web/content/publish/hgo-episodes");
const publishedAt = "2026-06-05T00:00:00.000Z";

const episodes = [
  {
    sourceFile: "Episode 1 - Preface.md",
    id: "hgo-public-episode-1",
    slug: "episode-1-write-it-down",
    title: "The Wednesday Rule",
    subtitle: "Preface: why the story exists",
    episodeNumber: "1",
    youtubeId: "96LN__TA-T8",
    summary:
      "Scott and Charlie open High Ground Odyssey with the invitation at the center of the whole project: write the story down, learn from it, and leave something useful behind.",
    hero: {
      eyebrow: "High Ground Odyssey",
      colorMood: "warm sunrise / field journal",
    },
    beats: [
      {
        title: "Why this book exists",
        summary:
          "Homer frames the manuscript as a life sketch, leadership field guide, and honest record of hard-won lessons.",
      },
      {
        title: "Learning the hard way",
        summary:
          "The preface names mistakes, maturity, memory, and legacy as the raw material of leadership.",
      },
      {
        title: "Charlie's invitation into the project",
        summary:
          "Charlie explains the research-assistant role that became a second voice alongside his brother's story.",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Frames the book as his own record of learning, leading, failing, recovering, and leaving a useful story behind.",
      },
      {
        speaker: "Charlie",
        summary:
          "Names the privilege and pressure of helping carry his brother's leadership lessons into a broader conversation.",
      },
    ],
  },
  {
    sourceFile: "Episode 2 - Introduction.md",
    id: "hgo-public-episode-2",
    slug: "episode-2-look-for-lessons",
    title: "Look for Lessons",
    subtitle: "It's a metaphor!",
    episodeNumber: "2",
    youtubeId: "7Rn4rV2cLy4",
    summary:
      "The introduction turns ordinary life into a leadership laboratory: birds, stained glass, family dinners, and the discipline of making better meaning from everyday things.",
    hero: {
      eyebrow: "High Ground Odyssey",
      colorMood: "amber window light / farm table",
    },
    beats: [
      {
        title: "The Sunday table",
        summary:
          "Homer remembers a family rhythm where daily life became material for reflection and teaching.",
      },
      {
        title: "The stained-glass lesson",
        summary:
          "A teenage moment in a concert hall becomes a breakthrough in seeing ordinary experiences as moral metaphors.",
      },
      {
        title: "Better meaning, not just more meaning",
        summary:
          "Charlie adds the guardrail: patterns can be real while explanations are false, so stories need to make us more honest and capable.",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Invites readers to look for encouraging and enlightening lessons in the challenging and mundane parts of life.",
      },
      {
        speaker: "Charlie",
        summary:
          "Connects metaphor-making to pattern recognition, apophenia, data stories, and the need to test whether meaning is useful and true.",
      },
    ],
  },
  {
    sourceFile: "Episode 3 - Chapter 0.md",
    id: "hgo-public-episode-3",
    slug: "episode-3-chub-and-jack",
    title: "Know Where You Came From",
    subtitle: "Chapter Zero: Chub and Jack",
    episodeNumber: "3",
    youtubeId: "rf3L1xki_Nk",
    summary:
      "Chapter Zero follows family memory from Australia to Idaho, from war service to farm work, and from Chub and Jack's legend to the leadership power of knowing where you came from.",
    hero: {
      eyebrow: "High Ground Odyssey",
      colorMood: "sagebrush / old leather / winter road",
    },
    beats: [
      {
        title: "Where the story starts",
        summary:
          "The episode opens with family migration, hard ground, the Great Depression, and the resilience of the Sparrow line.",
      },
      {
        title: "Raymond Sparrow the welder",
        summary:
          "A farm kid drafted into war finds a skill that carries him through service and into a life of work.",
      },
      {
        title: "Chub and Jack pull through",
        summary:
          "Grandma MarDene's story becomes a durable family metaphor for teamwork, obedience, effort, and faith under pressure.",
      },
      {
        title: "The deeper legend",
        summary:
          "Jack's injury and Chub's loyalty turn a horse story into a meditation on disability, guidance, trust, and not quitting.",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Uses family history to argue that knowing who you are and where you came from is part of knowing where you can go.",
      },
      {
        speaker: "Charlie",
        summary:
          "Adds research, context, and personal reflection around inheritance, legacy, identity, and the stories that shape us.",
      },
    ],
  },
];

function sourceHash(packet, essayVersion) {
  return crypto
    .createHash("sha256")
    .update(`${packet.id}\n${packet.slug}\n${packet.media.youtubeId}\n${essayVersion}`)
    .digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const packets = [];
for (const episode of episodes) {
  const sourcePath = path.join(sourceDir, episode.sourceFile);
  const essayVersion = (await fs.readFile(sourcePath, "utf8")).trim();
  const packet = {
    packetKind: "hgo-public-episode-packet-v1",
    id: episode.id,
    slug: episode.slug,
    title: episode.title,
    subtitle: episode.subtitle,
    episodeNumber: episode.episodeNumber,
    summary: episode.summary,
    publishStatus: "live",
    hero: episode.hero,
    media: {
      youtubeId: episode.youtubeId,
    },
    showNotes: {
      beats: episode.beats,
      voiceCards: episode.voiceCards,
    },
    quotes: [],
    essayVersion,
    provenance: {
      sourceArtifactHash: sourceHash(
        {
          id: episode.id,
          slug: episode.slug,
          media: { youtubeId: episode.youtubeId },
        },
        essayVersion,
      ),
      publishedAt,
    },
  };

  packets.push(packet);
  await fs.writeFile(
    path.join(outputDir, `${episode.slug}.json`),
    `${JSON.stringify(packet, null, 2)}\n`,
  );
}

const index = packets.map((packet) => ({
  id: packet.id,
  slug: packet.slug,
  title: packet.title,
  episodeNumber: packet.episodeNumber,
  summary: packet.summary,
  publishedAt: packet.provenance.publishedAt,
}));

await fs.writeFile(
  path.join(outputDir, "episodes-index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);

console.log(`Seeded ${packets.length} HGO public episode packet(s) in ${path.relative(repoRoot, outputDir)}.`);
