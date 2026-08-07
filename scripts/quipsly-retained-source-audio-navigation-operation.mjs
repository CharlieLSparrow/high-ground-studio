#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { parseSourceAudioNavigationResult } from "../packages/quipsly-media-processing/src/index.ts";
import {
  publicSourceAudioNavigationStatus,
  requestSourceAudioNavigation,
} from "../apps/quipsly/src/lib/server/source-audio-navigation.ts";

const databaseUrl =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(
    `Refusing retained audio-navigation operation against non-loopback database ${parsedDatabase.hostname}.`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const projectSlug =
  process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT ||
  "high-ground-odyssey-manuscript";
const actorEmail = "source-story-retained-route@quipsly.test";

try {
  const [project, actor] = await Promise.all([
    prisma.studioProject.findFirst({
      where: { slug: projectSlug },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true },
    }),
    prisma.user.findUnique({
      where: { primaryEmail: actorEmail },
      select: { id: true },
    }),
  ]);
  if (!project || !actor) {
    throw new Error(
      "The retained Source Story project or operator is unavailable.",
    );
  }
  const sourceSet = await prisma.studioMediaSourceSet.findFirst({
    where: { projectId: project.id, kind: "insta360-360" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayName: true,
      sourceClockRevision: {
        select: {
          id: true,
          derivatives: {
            where: {
              kind: "collaboration-proxy",
              status: "ready",
              storageProvider: "local",
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              locator: true,
              contentSha256: true,
              sizeBytes: true,
              generation: true,
            },
          },
        },
      },
    },
  });
  const proxy = sourceSet?.sourceClockRevision.derivatives[0];
  if (!sourceSet || !proxy) {
    throw new Error(
      "The retained Insta360 collaboration proxy is unavailable.",
    );
  }
  const proxyPath = await realpath(proxy.locator);
  const proxyBefore = await inspectFile(proxyPath);
  if (
    proxyBefore.sha256 !== proxy.contentSha256 ||
    proxyBefore.sizeBytes !== Number(proxy.sizeBytes)
  ) {
    throw new Error(
      "The retained collaboration proxy does not match its database receipt.",
    );
  }

  const queued = await requestSourceAudioNavigation({
    prisma,
    projectId: project.id,
    sourceRevisionId: sourceSet.sourceClockRevision.id,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: randomUUID(),
    retryFailed: true,
  });
  let job = queued.job;
  const deadline = Date.now() + 60_000;
  while (
    !["output-ready", "completed"].includes(job.status) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    job =
      (await prisma.studioWorkflowJob.findUnique({ where: { id: job.id } })) ??
      job;
    if (job.status === "failed") {
      throw new Error(
        `The retained audio-navigation job failed: ${job.error || "unknown worker failure"}`,
      );
    }
  }
  if (!["output-ready", "completed"].includes(job.status)) {
    throw new Error(
      "The retained audio-navigation evidence did not complete before the operation deadline.",
    );
  }
  const manifest =
    job.inputJson && typeof job.inputJson === "object" ? job.inputJson : {};
  const result =
    job.resultJson && typeof job.resultJson === "object" ? job.resultJson : {};
  const receipt = parseSourceAudioNavigationResult(result.receipt, manifest);
  const publicStatus = publicSourceAudioNavigationStatus(job);
  if (
    publicStatus.status !== "output-ready" ||
    !publicStatus.evidence ||
    publicStatus.evidence.waveform.length < 1 ||
    publicStatus.evidence.frequencyBands.length < 1
  ) {
    throw new Error(
      "The public audio-navigation projection did not retain bounded waveform and frequency evidence.",
    );
  }
  const proxyAfter = await inspectFile(proxyPath);
  if (
    proxyBefore.sha256 !== proxyAfter.sha256 ||
    proxyBefore.sizeBytes !== proxyAfter.sizeBytes
  ) {
    throw new Error(
      "The collaboration proxy changed during retained audio navigation.",
    );
  }
  const replay = await requestSourceAudioNavigation({
    prisma,
    projectId: project.id,
    sourceRevisionId: sourceSet.sourceClockRevision.id,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: randomUUID(),
  });
  if (
    !replay.replayed ||
    replay.state !== "ready" ||
    replay.job.id !== job.id
  ) {
    throw new Error(
      "The completed audio-navigation job did not replay from its exact proxy generation.",
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "quipsly-retained-source-audio-navigation-operation-v1",
        projectSlug: project.slug,
        sourceSet: {
          id: sourceSet.id,
          displayName: sourceSet.displayName,
          sourceRevisionId: sourceSet.sourceClockRevision.id,
        },
        input: {
          derivativeId: proxy.id,
          generation: proxy.generation,
          sha256: proxyAfter.sha256,
          sizeBytes: proxyAfter.sizeBytes,
          unchanged: true,
        },
        job: { id: job.id, status: job.status, replayed: replay.replayed },
        evidence: {
          decodedDurationSeconds: receipt.audioSignal.durationSeconds,
          sampleRate: receipt.audioSignal.sampleRate,
          channelCount: receipt.audioSignal.channelCount,
          fullWaveformWindows: receipt.audioSignal.waveform.length,
          publicWaveformWindows: publicStatus.evidence.waveform.length,
          frequencyBands: receipt.audioSignal.frequencyProfile?.bands.map(
            (band) => band.id,
          ),
          signalStatus: receipt.audioSignal.signalStatus,
          rmsDbfs: receipt.audioSignal.rmsDbfs,
          samplePeakDbfs: receipt.audioSignal.samplePeakDbfs,
          observations: receipt.audioSignal.observations,
        },
        boundaries: receipt.boundaries,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await prisma.$disconnect();
}

async function inspectFile(candidate) {
  const details = await stat(candidate);
  if (!details.isFile() || details.size <= 0) {
    throw new Error(`Retained file is unavailable: ${candidate}`);
  }
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(candidate);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return { sha256: hash.digest("hex"), sizeBytes: details.size };
}
