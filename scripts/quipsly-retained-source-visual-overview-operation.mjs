#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_PROFILE,
  parseSourceVisualOverviewResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { requestSourceVisualOverview } from "../apps/quipsly/src/lib/server/source-visual-overview.ts";

const databaseUrl =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(
    `Refusing retained visual operation against non-loopback database ${parsedDatabase.hostname}.`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const projectSlug =
  process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT ||
  "high-ground-odyssey-manuscript";
const actorEmail = "source-story-retained-route@quipsly.test";
const sourceSetIdArgument = argumentValue("--source-set");
const captureKeyArgument =
  argumentValue("--capture-key") ||
  process.env.QUIPSLY_SOURCE_CAPTURE_KEY ||
  "VID_20250711_222639_037";
if (sourceSetIdArgument && argumentValue("--capture-key")) {
  throw new Error("Choose either --source-set or --capture-key, not both.");
}

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
  if (!project || !actor)
    throw new Error(
      "The retained Source Story project or operator is unavailable.",
    );
  const sourceSet = await prisma.studioMediaSourceSet.findFirst({
    where: {
      projectId: project.id,
      kind: "insta360-360",
      ...(sourceSetIdArgument
        ? { id: sourceSetIdArgument }
        : { captureKey: captureKeyArgument }),
    },
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
            },
          },
        },
      },
    },
  });
  const proxy = sourceSet?.sourceClockRevision.derivatives[0];
  if (!sourceSet || !proxy)
    throw new Error(
      "The retained Insta360 collaboration proxy is unavailable.",
    );
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

  const queued = await requestSourceVisualOverview({
    prisma,
    projectId: project.id,
    sourceRevisionId: sourceSet.sourceClockRevision.id,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: randomUUID(),
    retryFailed: true,
  });
  let derivative = queued.derivative;
  let job = queued.job;
  const deadline = Date.now() + 45_000;
  while (!derivative && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (job)
      job = await prisma.studioWorkflowJob.findUnique({
        where: { id: job.id },
      });
    if (job?.status === "failed")
      throw new Error(
        `The retained visual job failed: ${job.error || "unknown worker failure"}`,
      );
    derivative = await prisma.studioMediaDerivative.findFirst({
      where: {
        projectId: project.id,
        sourceRevisionId: sourceSet.sourceClockRevision.id,
        kind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
        profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
        status: "ready",
      },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!derivative)
    throw new Error(
      "The retained visual derivative did not complete before the operation deadline.",
    );
  const outputPath = await realpath(derivative.locator);
  const output = await inspectFile(outputPath);
  if (
    output.sha256 !== derivative.contentSha256 ||
    output.sizeBytes !== Number(derivative.sizeBytes) ||
    derivative.mimeType !== "image/jpeg"
  ) {
    throw new Error(
      "The retained visual-map bytes do not match their database receipt.",
    );
  }
  const completedJob = await prisma.studioWorkflowJob.findUnique({
    where: { id: derivative.workflowJobId },
  });
  const resultJson =
    completedJob?.resultJson &&
    typeof completedJob.resultJson === "object" &&
    !Array.isArray(completedJob.resultJson)
      ? completedJob.resultJson
      : {};
  const receipt = parseSourceVisualOverviewResult(resultJson.receipt);
  const proxyAfter = await inspectFile(proxyPath);
  if (
    proxyBefore.sha256 !== proxyAfter.sha256 ||
    proxyBefore.sizeBytes !== proxyAfter.sizeBytes
  ) {
    throw new Error(
      "The collaboration proxy changed during retained visual generation.",
    );
  }
  const replay = await requestSourceVisualOverview({
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
    replay.derivative?.id !== derivative.id
  ) {
    throw new Error(
      "The completed visual derivative did not replay from its exact input generation.",
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "quipsly-retained-source-visual-overview-operation-v1",
        projectSlug: project.slug,
        sourceSet: {
          id: sourceSet.id,
          displayName: sourceSet.displayName,
          sourceRevisionId: sourceSet.sourceClockRevision.id,
          selection: sourceSetIdArgument
            ? { sourceSetId: sourceSetIdArgument }
            : { captureKey: captureKeyArgument },
        },
        input: {
          derivativeId: proxy.id,
          sha256: proxyAfter.sha256,
          sizeBytes: proxyAfter.sizeBytes,
          unchanged: true,
        },
        job: {
          id: derivative.workflowJobId,
          status: completedJob?.status,
          replayed: replay.replayed,
        },
        output: {
          derivativeId: derivative.id,
          sha256: output.sha256,
          sizeBytes: output.sizeBytes,
          mimeType: derivative.mimeType,
          widthPixels: derivative.widthPixels,
          heightPixels: derivative.heightPixels,
          columns: receipt.output.columns,
          rows: receipt.output.rows,
          sampleTimesSeconds: receipt.output.sampleTimesSeconds,
          protectedUrl: `/api/media/derivatives/${encodeURIComponent(derivative.id)}`,
        },
        boundaries: {
          originalRemainsSourceTruth: receipt.originalRemainsSourceTruth,
          inputDerivativeRemainsUnchanged:
            receipt.inputDerivativeRemainsUnchanged,
        },
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
  if (!details.isFile() || details.size <= 0)
    throw new Error(`Retained file is unavailable: ${candidate}`);
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(candidate);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return { sha256: hash.digest("hex"), sizeBytes: details.size };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = String(process.argv[index + 1] || "").trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}
