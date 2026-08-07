#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { createSourceStoryCard, readSourceStoryWorkspace } from "../apps/quipsly/src/lib/server/source-story.ts";
import { requestExternalSourceProxy } from "../apps/quipsly/src/lib/server/external-source-proxy.ts";

const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(`Refusing retained proxy dogfood against non-loopback database ${parsedDatabase.hostname}.`);
}

const projectSlug = process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey-manuscript";
const actorEmail = String(process.env.QUIPSLY_EXTERNAL_MEDIA_ACTOR || "render-dogfood@quipsly.test").trim().toLowerCase();
const fileName = process.env.QUIPSLY_EXTERNAL_MEDIA_FILENAME || "Ted Lasso Be Curious.mp4";

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const [actor, project] = await Promise.all([
    prisma.user.findFirst({ where: { primaryEmail: actorEmail }, select: { id: true } }),
    prisma.studioProject.findFirst({ where: { slug: projectSlug }, orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, name: true } }),
  ]);
  if (!actor) throw new Error(`Retained actor not found: ${actorEmail}`);
  if (!project) throw new Error(`Retained Nest not found: ${projectSlug}`);
  const reference = await prisma.studioExternalMediaReference.findFirst({
    where: { projectId: project.id, provider: "local-file-vault", fileName },
    orderBy: { updatedAt: "desc" },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const revision = reference?.revisions[0];
  const locator = reference?.providerLocatorJson && typeof reference.providerLocatorJson === "object" && !Array.isArray(reference.providerLocatorJson)
    ? reference.providerLocatorJson
    : {};
  const sourcePath = typeof locator.localPath === "string" ? locator.localPath : "";
  if (!reference || !revision || !sourcePath) throw new Error("Refresh the retained local-file-vault reference before proxy dogfood.");
  const before = await stat(sourcePath);
  const sourceSha256Before = await sha256File(sourcePath);
  if (revision.contentSha256 !== sourceSha256Before || revision.sizeBytes !== BigInt(before.size)) {
    throw new Error("The retained external revision does not match current source bytes.");
  }

  const request = await requestExternalSourceProxy({
    prisma,
    projectId: project.id,
    referenceId: reference.id,
    sourceRevisionId: revision.id,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: deterministicUuid(`proxy:${project.id}:${revision.id}`),
    retryFailed: true,
  });
  const jobId = request.job?.id || request.derivative?.workflowJobId;
  if (!jobId) throw new Error("Proxy request returned neither a derivative nor a durable job.");
  let derivative = request.derivative;
  let job = request.job;
  const deadline = Date.now() + 180_000;
  while (!derivative && Date.now() < deadline) {
    await wait(1_000);
    [job, derivative] = await Promise.all([
      prisma.studioWorkflowJob.findUnique({ where: { id: jobId } }),
      prisma.studioMediaDerivative.findFirst({ where: { workflowJobId: jobId } }),
    ]);
    if (job?.status === "failed") throw new Error(`Proxy worker failed: ${job.error}`);
  }
  if (!derivative) throw new Error(`Proxy job ${jobId} did not produce a derivative before timeout.`);
  const [outputStat, outputSha256, sourceSha256After] = await Promise.all([
    stat(derivative.locator),
    sha256File(derivative.locator),
    sha256File(sourcePath),
  ]);
  if (outputStat.size !== Number(derivative.sizeBytes) || outputSha256 !== derivative.contentSha256) {
    throw new Error("The retained derivative does not match its output receipt.");
  }
  if (outputStat.size >= before.size) {
    throw new Error(`The browsing derivative is not storage-efficient (${outputStat.size} >= ${before.size} bytes).`);
  }
  if (sourceSha256After !== sourceSha256Before || (await stat(sourcePath)).size !== before.size) {
    throw new Error("The original changed during retained proxy operation.");
  }

  let card = await prisma.studioStoryCard.findFirst({
    where: { projectId: project.id, title: "Be Curious · external vault proxy select", archivedAt: null },
    include: { sourceRange: true },
  });
  if (!card) {
    const board = await prisma.studioStoryBoard.findFirst({
      where: { projectId: project.id, archivedAt: null, title: { contains: "Episode 9", mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    const created = await createSourceStoryCard({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      value: {
        projectId: project.id,
        sourceRevisionId: revision.id,
        externalReferenceId: reference.id,
        boardId: board?.id ?? null,
        expectedBoardRevision: board?.revision ?? null,
        clientRequestId: deterministicUuid(`external-card:${project.id}:${revision.id}:1.107004:4.263378`),
        title: "Be Curious · external vault proxy select",
        synopsis: "Ted challenges Rupert to a game of darts and reframes what curiosity reveals about people.",
        notes: "Retained source-to-story proof: scrubbed from a lightweight derivative while the card remains bound to the exact external original revision.",
        purpose: "evidence",
        startSeconds: 1.107004,
        endSeconds: 4.263378,
        groupKey: "shared-viewing-clips",
        laneKey: "story",
        tagIds: [],
      },
    });
    card = await prisma.studioStoryCard.findUnique({ where: { id: created.card.id }, include: { sourceRange: true } });
  }
  if (!card?.sourceRange || card.sourceRange.sourceRevisionId !== revision.id) {
    throw new Error("The retained story card is not bound to the exact external source revision.");
  }
  const workspace = await readSourceStoryWorkspace(prisma, project.id);
  const projected = workspace.externalSources.find((source) => source.id === reference.id);
  if (!projected?.latestSourceRevision?.collaborationProxy) throw new Error("The verified proxy is missing from the client-safe workspace projection.");
  const serialized = JSON.stringify(projected);
  if (serialized.includes(sourcePath) || serialized.includes(derivative.locator)) throw new Error("The client projection exposed a server-side local path.");

  let appReadback = null;
  const password = String(process.env.QUIPSLY_LOCAL_QA_PASSWORD || "");
  if (password.length >= 12) {
    const appOrigin = "http://127.0.0.1:3012";
    const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
    const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: actorEmail, password, returnSecureToken: true }),
    });
    const auth = await signIn.json().catch(() => ({}));
    if (signIn.status !== 200 || !auth.idToken) throw new Error("The retained source operator could not sign in to the local Firebase emulator.");
    const session = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: auth.idToken }),
    });
    const sessionBody = await session.json().catch(() => ({}));
    const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
    if (session.status !== 200 || sessionBody.success !== true || !cookie) throw new Error("The retained source operator could not establish a first-party session.");
    const derivativeUrl = `${appOrigin}/api/media/derivatives/${encodeURIComponent(derivative.id)}`;
    const [page, range, suffix, invalidRange, denied, head] = await Promise.all([
      fetch(`${appOrigin}/nests/${encodeURIComponent(project.slug)}/story?external=${encodeURIComponent(reference.id)}`, { headers: { cookie, "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=0-1023", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=-32", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=999999999-", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { range: "bytes=0-31", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { method: "HEAD", headers: { cookie, "cache-control": "no-cache" } }),
    ]);
    const html = await page.text();
    const rangeBytes = new Uint8Array(await range.arrayBuffer());
    const suffixBytes = new Uint8Array(await suffix.arrayBuffer());
    if (page.status !== 200 || !html.includes(fileName) || !html.includes("Be Curious · external vault proxy select")) {
      throw new Error(`The retained Source-to-Story page failed canonical render readback (HTTP ${page.status}).`);
    }
    if (range.status !== 206 || rangeBytes.byteLength !== 1_024 || !String(range.headers.get("content-range")).startsWith("bytes 0-1023/")) {
      throw new Error(`The protected proxy route failed byte-range playback readback (HTTP ${range.status}).`);
    }
    if (suffix.status !== 206 || suffixBytes.byteLength !== 32 || !String(suffix.headers.get("content-range")).endsWith(`/${outputStat.size}`)) {
      throw new Error(`The protected proxy route failed suffix-range playback readback (HTTP ${suffix.status}).`);
    }
    if (invalidRange.status !== 416 || invalidRange.headers.get("content-range") !== `bytes */${outputStat.size}`) {
      throw new Error(`The protected proxy route failed invalid-range refusal (HTTP ${invalidRange.status}).`);
    }
    if (denied.status !== 404) throw new Error(`The proxy route exposed media without an authenticated project session (HTTP ${denied.status}).`);
    if (head.status !== 200 || head.headers.get("content-length") !== String(outputStat.size)) {
      throw new Error(`The protected proxy route failed HEAD metadata readback (HTTP ${head.status}).`);
    }
    appReadback = {
      pageStatus: page.status,
      sourceVisible: true,
      cardVisible: true,
      proxyRangeStatus: range.status,
      proxyRangeBytes: rangeBytes.byteLength,
      proxySuffixRangeStatus: suffix.status,
      proxySuffixRangeBytes: suffixBytes.byteLength,
      invalidRangeStatus: invalidRange.status,
      unauthenticatedRangeStatus: denied.status,
      proxyHeadStatus: head.status,
    };
    await fetch(`${appOrigin}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => undefined);
  }

  console.log(JSON.stringify({
    schema: "quipsly-retained-external-source-proxy-operation-v1",
    project: project.name,
    referenceId: reference.id,
    sourceRevisionId: revision.id,
    sourceSha256: sourceSha256Before,
    sourceSizeBytes: before.size,
    sourceMutated: false,
    derivativeId: derivative.id,
    derivativeSha256: derivative.contentSha256,
    derivativeSizeBytes: derivative.sizeBytes.toString(),
    derivativeToSourceRatio: Number((outputStat.size / before.size).toFixed(4)),
    derivativeDurationSeconds: derivative.durationSeconds,
    derivativeDimensions: `${derivative.widthPixels}x${derivative.heightPixels}`,
    derivativeFramesPerSecond: derivative.framesPerSecond,
    jobId,
    jobStatus: job?.status ?? "output-ready",
    cardId: card.id,
    sourceRangeId: card.sourceRange.id,
    sourceRange: [card.sourceRange.startSeconds, card.sourceRange.endSeconds],
    cardBoundToOriginalRevision: true,
    serverPathExposedToClient: false,
    appReadback,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
