#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { attachVerifiedExternalMediaSource } from "../apps/quipsly/src/lib/server/external-media-source.ts";
import { requestExternalSourceProxy } from "../apps/quipsly/src/lib/server/external-source-proxy.ts";
import { createMediaSourceSet, createSourceStoryCard, createStoryBoard, promoteSourceStoryCardToEpisode, readSourceStoryWorkspace, withdrawSourceStoryTimelinePlacement } from "../apps/quipsly/src/lib/server/source-story.ts";

const databaseUrl = process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(`Refusing Insta360 dogfood against non-loopback database ${parsedDatabase.hostname}.`);
}

const packageDirectory = path.resolve(process.env.QUIPSLY_INSTA360_PACKAGE || "/Volumes/My Passport/Insta360 Download/VID_20250711_222639_00_037-Original");
const originalPath = path.join(packageDirectory, "VID_20250711_222639_00_037.insv");
const browsePath = path.join(packageDirectory, "LRV_20250711_222639_01_037.lrv");
const projectSlug = process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey-manuscript";
const actorEmail = String(process.env.QUIPSLY_EXTERNAL_MEDIA_ACTOR || "render-dogfood@quipsly.test").trim().toLowerCase();
const captureKey = "VID_20250711_222639_037";
const displayName = "Insta360 · July 11 micro take · 22:26:39";

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

async function retainExactFile(filePath, metadata, actor, project, prisma) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size <= 0) throw new Error(`Missing retained package member: ${filePath}`);
  const checksumSha256 = await sha256File(filePath);
  const extension = path.extname(filePath).toLowerCase() || ".bin";
  const cacheDirectory = path.join(tmpdir(), "quipsly-media-ingest", "external-source-cache");
  const cachePath = path.join(cacheDirectory, `${checksumSha256}${extension}`);
  await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
  const cached = await stat(cachePath).catch(() => null);
  if (!cached || cached.size !== fileStat.size || await sha256File(cachePath) !== checksumSha256) {
    await copyFile(filePath, cachePath, constants.COPYFILE_FICLONE);
    await chmod(cachePath, 0o400);
  }
  if (await sha256File(cachePath) !== checksumSha256) throw new Error(`Execution cache failed checksum verification: ${filePath}`);

  const externalFileId = `local-file:${createHash("sha256").update(filePath).digest("hex")}`;
  const headRevisionKey = `sha256:${checksumSha256}`;
  const existing = await prisma.studioExternalMediaReference.findUnique({
    where: { projectId_provider_externalFileId: { projectId: project.id, provider: "local-file-vault", externalFileId } },
    select: { revision: true },
  });
  const operation = existing ? "refresh" : "attach";
  const result = await attachVerifiedExternalMediaSource({
    prisma,
    value: {
      projectId: project.id,
      actorUserId: actor.id,
      actorEmail,
      clientRequestId: deterministicUuid(`${project.id}:${externalFileId}:${headRevisionKey}:${operation}:${existing?.revision ?? 0}:spatial-v1`),
      operation,
      expectedReferenceRevision: existing?.revision ?? null,
      verifiedFile: {
        provider: "local-file-vault",
        connectionKey: `local-vault:${createHash("sha256").update(packageDirectory).digest("hex").slice(0, 20)}`,
        externalFileId,
        fileName: path.basename(filePath),
        mimeType: metadata.mimeType,
        sizeBytes: fileStat.size,
        headRevisionKey,
        checksumSha256,
        localPath: cachePath,
        providerCreatedAt: fileStat.birthtime,
        providerModifiedAt: fileStat.mtime,
        durationSeconds: 0.416667,
        widthPixels: metadata.widthPixels,
        heightPixels: metadata.heightPixels,
        framesPerSecond: 24,
        mediaProjection: metadata.mediaProjection,
        projectionMetadata: metadata.projectionMetadata,
        accessState: "available",
        capabilityState: "downloadable",
        canDownload: true,
        canReadRevisions: false,
        canCopy: true,
      },
    },
  });
  return { ...result, filePath, fileStat, checksumSha256, cachePath };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function verifyAuthenticatedAppBoundary({ prisma, project, createdBy, sourceSetId, boardId, derivative, derivativeStat, episode, placementId }) {
  const appOrigin = "http://127.0.0.1:3012";
  const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
  const authUrl = new URL(authOrigin);
  if (!["127.0.0.1", "localhost", "::1"].includes(authUrl.hostname)) {
    throw new Error(`Refusing disposable QA identity against non-loopback Firebase Auth host ${authUrl.hostname}.`);
  }
  const suffix = randomUUID().slice(0, 8);
  const email = `source-story-readback-${suffix}@quipsly.test`;
  const password = `Local-only-${randomUUID()}!`;
  let userId = null;
  let grantId = null;
  let idToken = null;
  let cookie = null;
  let firebaseApp = null;
  let firebaseUid = null;
  try {
    const user = await prisma.user.create({ data: { primaryEmail: email, name: "Source Story readback" }, select: { id: true } });
    userId = user.id;
    const grant = await prisma.studioProjectAccessGrant.create({
      data: { projectId: project.id, email, role: "EDITOR", status: "ACTIVE", createdByUserId: createdBy.id, createdByEmail: actorEmail },
      select: { id: true },
    });
    grantId = grant.id;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authUrl.host;
    process.env.GCLOUD_PROJECT = "quipsly-reef";
    process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";
    firebaseApp = initializeApp({ projectId: "quipsly-reef" }, `source-story-readback-${suffix}`);
    const firebaseAuth = getAuth(firebaseApp);
    const firebaseUser = await firebaseAuth.createUser({
      uid: `source-story-readback-${suffix}`,
      email,
      emailVerified: true,
      password,
      displayName: "Source Story readback",
    });
    firebaseUid = firebaseUser.uid;
    const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const auth = await signIn.json().catch(() => ({}));
    if (signIn.status !== 200 || !auth.idToken) throw new Error("The disposable Source Story reader could not sign in to the local Firebase emulator.");
    idToken = auth.idToken;
    const session = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const sessionBody = await session.json().catch(() => ({}));
    const sessionSetCookie = session.headers.getSetCookie()
      .filter((value) => value.startsWith("session=") && !value.startsWith("session=;"))
      .at(-1);
    cookie = sessionSetCookie ? sessionSetCookie.split(";")[0] : null;
    if (session.status !== 200 || sessionBody.success !== true || !cookie) throw new Error("The disposable Source Story reader could not establish a first-party session.");
    const derivativeUrl = `${appOrigin}/api/media/derivatives/${encodeURIComponent(derivative.id)}`;
    const storyUrl = `${appOrigin}/nests/${encodeURIComponent(project.slug)}/story?set=${encodeURIComponent(sourceSetId)}&board=${encodeURIComponent(boardId)}`;
    const [page, sourceStoryReadback, editorPage, episodeReadback, range, rangeTail, invalidRange, denied, head] = await Promise.all([
      fetch(storyUrl, { redirect: "manual", headers: { cookie, "cache-control": "no-cache" } }),
      fetch(`${appOrigin}/api/nests/${encodeURIComponent(project.slug)}/source-story`, { headers: { cookie, "cache-control": "no-cache" } }),
      fetch(`${appOrigin}/editor?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episode.slug)}`, { redirect: "manual", headers: { cookie, "cache-control": "no-cache" } }),
      fetch(`${appOrigin}/api/episode-production`, { method: "POST", headers: { cookie, "content-type": "application/json", "cache-control": "no-cache" }, body: JSON.stringify({ action: "ensure", projectSlug: project.slug, episodeSlug: episode.slug }) }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=0-1023", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=-32", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { cookie, range: "bytes=999999999-", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { headers: { range: "bytes=0-31", "cache-control": "no-cache" } }),
      fetch(derivativeUrl, { method: "HEAD", headers: { cookie, "cache-control": "no-cache" } }),
    ]);
    const html = await page.text();
    const sourceStoryBody = await sourceStoryReadback.json().catch(() => ({}));
    const editorHtml = await editorPage.text();
    const episodeBody = await episodeReadback.json().catch(() => ({}));
    const rangeBytes = new Uint8Array(await range.arrayBuffer());
    const tailBytes = new Uint8Array(await rangeTail.arrayBuffer());
    const missingPageEvidence = [
      ["source set", displayName],
      ["board", "Insta360 story selects"],
      ["source card", "Micro take · spatial composition proof"],
      ["spatial render status", "Exact-source 360 render"],
      ["spatial render handoff", "Quipsly can reframe automatically after one reviewed Insta360 Studio master export."],
    ].filter(([, evidence]) => !html.includes(evidence)).map(([label]) => label);
    if (page.status !== 200 || missingPageEvidence.length > 0) {
      const pageKind = html.includes("Sign in") || html.includes("Welcome back")
        ? "sign-in"
        : html.includes("not found") || html.includes("404")
          ? "not-found"
          : "unknown-shell";
      throw new Error(`The retained Insta360 Source-to-Story page failed canonical render readback (HTTP ${page.status}; redirect ${page.headers.get("location") || "none"}; page ${pageKind}; ${html.length} bytes; missing ${missingPageEvidence.join(", ") || "no named evidence"}).`);
    }
    if (editorPage.status !== 200 || editorHtml.includes("Welcome back") || editorHtml.includes("Sign in to Quipsly")) {
      throw new Error(`The retained Source-to-Story editor shell failed authenticated readback (HTTP ${editorPage.status}; ${editorHtml.length} bytes).`);
    }
    const projectedPlacement = Array.isArray(sourceStoryBody?.workspace?.timelinePlacements)
      ? sourceStoryBody.workspace.timelinePlacements.find((placement) => placement?.id === placementId && placement?.status === "active")
      : null;
    const projectedEpisode = Array.isArray(sourceStoryBody?.workspace?.episodes)
      ? sourceStoryBody.workspace.episodes.find((candidate) => candidate?.id === episode.id && candidate?.clipCount >= 1)
      : null;
    if (sourceStoryReadback.status !== 200 || !projectedPlacement || !projectedEpisode) {
      throw new Error(`The authenticated Source Story API did not project the retained Episode placement (HTTP ${sourceStoryReadback.status}).`);
    }
    if (sourceStoryBody?.spatialRenderReadiness?.readiness?.status !== "manual-stitch-handoff" || sourceStoryBody?.spatialRenderReadiness?.readiness?.automaticReframeReady !== true) {
      throw new Error("The Source Story API did not report the locally operated spatial executor boundary.");
    }
    const promotedClip = Array.isArray(episodeBody?.timelineJson?.timelineClips)
      ? episodeBody.timelineJson.timelineClips.find((clip) => clip?.sourceStory?.placementId === placementId)
      : null;
    const promotedMedia = Array.isArray(episodeBody?.productionJson?.importedMedia)
      ? episodeBody.productionJson.importedMedia.find((asset) => asset?.metadata?.sourceStory?.placementId === placementId)
      : null;
    if (episodeReadback.status !== 200 || !promotedClip || promotedClip.sourceStory?.boundaries?.finalRenderMustResolveExactSource !== true) {
      throw new Error(`The canonical Episode API did not return the exact promoted Source Story clip (HTTP ${episodeReadback.status}).`);
    }
    if (episodeBody.timelineJson?.projectSlug !== project.slug || episodeBody.productionJson?.projectSlug !== project.slug) {
      throw new Error(`The canonical Episode artifact lost its project slug boundary (timeline ${episodeBody.timelineJson?.projectSlug || "missing"}; production ${episodeBody.productionJson?.projectSlug || "missing"}).`);
    }
    if (!promotedMedia || promotedMedia.is360 !== true || promotedMedia.originalFormat !== "lrv") {
      throw new Error(`The canonical Episode artifact did not preserve the spatial-source descriptor (is360 ${String(promotedMedia?.is360)}; original format ${promotedMedia?.originalFormat || "missing"}).`);
    }
    if (range.status !== 206 || rangeBytes.byteLength !== 1_024 || !String(range.headers.get("content-range")).startsWith("bytes 0-1023/")) {
      throw new Error(`The protected spatial proxy route failed byte-range playback readback (HTTP ${range.status}).`);
    }
    if (rangeTail.status !== 206 || tailBytes.byteLength !== 32 || !String(rangeTail.headers.get("content-range")).endsWith(`/${derivativeStat.size}`)) {
      throw new Error(`The protected spatial proxy route failed suffix-range playback readback (HTTP ${rangeTail.status}).`);
    }
    if (invalidRange.status !== 416 || invalidRange.headers.get("content-range") !== `bytes */${derivativeStat.size}`) {
      throw new Error(`The protected spatial proxy route failed invalid-range refusal (HTTP ${invalidRange.status}).`);
    }
    if (denied.status !== 404) throw new Error(`The spatial proxy route exposed media without an authenticated project session (HTTP ${denied.status}).`);
    if (head.status !== 200 || head.headers.get("content-length") !== String(derivativeStat.size)) {
      throw new Error(`The protected spatial proxy route failed HEAD metadata readback (HTTP ${head.status}).`);
    }
    return {
      pageStatus: page.status,
      sourceSetVisible: true,
      boardVisible: true,
      sourceCardVisible: true,
      timelinePlacementVisible: true,
      sourceStoryApiStatus: sourceStoryReadback.status,
      spatialRenderStatus: sourceStoryBody.spatialRenderReadiness.readiness.status,
      automaticReframeReady: sourceStoryBody.spatialRenderReadiness.readiness.automaticReframeReady,
      editorPageStatus: editorPage.status,
      canonicalEpisodeStatus: episodeReadback.status,
      canonicalPlacementId: promotedClip.sourceStory.placementId,
      canonicalProjectSlug: episodeBody.timelineJson.projectSlug,
      canonicalSpatialMedia: { is360: promotedMedia.is360, originalFormat: promotedMedia.originalFormat },
      proxyRangeStatus: range.status,
      proxyRangeBytes: rangeBytes.byteLength,
      proxySuffixRangeStatus: rangeTail.status,
      proxySuffixRangeBytes: tailBytes.byteLength,
      invalidRangeStatus: invalidRange.status,
      unauthenticatedRangeStatus: denied.status,
      proxyHeadStatus: head.status,
      disposableReaderRemovedAfterProof: true,
    };
  } finally {
    if (cookie) await fetch(`${appOrigin}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => undefined);
    if (firebaseApp && firebaseUid) await getAuth(firebaseApp).deleteUser(firebaseUid).catch(() => undefined);
    if (firebaseApp) await deleteApp(firebaseApp).catch(() => undefined);
    if (grantId) await prisma.studioProjectAccessGrant.deleteMany({ where: { id: grantId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  }
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const [actor, project] = await Promise.all([
    prisma.user.findFirst({ where: { primaryEmail: actorEmail }, select: { id: true } }),
    prisma.studioProject.findFirst({ where: { slug: projectSlug }, orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, name: true } }),
  ]);
  if (!actor) throw new Error(`Retained actor not found: ${actorEmail}`);
  if (!project) throw new Error(`Retained Nest not found: ${projectSlug}`);

  const original = await retainExactFile(originalPath, {
      mimeType: "application/x-insta360-insv",
      widthPixels: 3840,
      heightPixels: 3840,
      mediaProjection: "dual-fisheye",
      projectionMetadata: { schema: "quipsly-insta360-projection-v1", tracks: 2, trackShape: "dual-fisheye", cameraFamily: "insta360" },
    }, actor, project, prisma);
  const browse = await retainExactFile(browsePath, {
      mimeType: "video/mp4",
      widthPixels: 1664,
      heightPixels: 832,
      mediaProjection: "equirectangular",
      projectionMetadata: { schema: "quipsly-insta360-projection-v1", ratio: "2:1", purpose: "camera-generated-low-resolution-view" },
    }, actor, project, prisma);

  const sourceSetResult = await createMediaSourceSet({
    prisma,
    actorUserId: actor.id,
    value: {
      projectId: project.id,
      clientRequestId: deterministicUuid(`${project.id}:${captureKey}:source-set-v1`),
      kind: "insta360-360",
      captureKey,
      displayName,
      sourceClockRevisionId: browse.sourceRevisionId,
      members: [
        { sourceRevisionId: original.sourceRevisionId, role: "primary-original", ordinal: 0, requiredForRender: true },
        { sourceRevisionId: browse.sourceRevisionId, role: "browse-proxy", ordinal: 0, requiredForRender: false },
      ],
      metadata: { cameraFamily: "Insta360", browseProjection: "equirectangular", sourceDirectoryName: path.basename(packageDirectory) },
    },
  });

  const proxyRequest = await requestExternalSourceProxy({
    prisma,
    projectId: project.id,
    referenceId: browse.reference.id,
    sourceRevisionId: browse.sourceRevisionId,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: deterministicUuid(`${project.id}:${browse.sourceRevisionId}:spatial-browse-proxy-v1`),
    retryFailed: true,
  });
  const jobId = proxyRequest.job?.id || proxyRequest.derivative?.workflowJobId;
  if (!jobId) throw new Error("The spatial browse request returned no durable job identity.");
  let derivative = proxyRequest.derivative;
  let job = proxyRequest.job;
  const deadline = Date.now() + 120_000;
  while (!derivative && Date.now() < deadline) {
    await wait(750);
    [job, derivative] = await Promise.all([
      prisma.studioWorkflowJob.findUnique({ where: { id: jobId } }),
      prisma.studioMediaDerivative.findFirst({ where: { workflowJobId: jobId } }),
    ]);
    if (job?.status === "failed") throw new Error(`Spatial browse worker failed: ${job.error}`);
  }
  if (!derivative) throw new Error(`Spatial browse job ${jobId} did not produce a derivative.`);
  if (derivative.widthPixels !== 960 || derivative.heightPixels !== 480) {
    throw new Error(`Expected a 2:1 spatial browse derivative, received ${derivative.widthPixels}x${derivative.heightPixels}.`);
  }

  const boardResult = await createStoryBoard({
    prisma,
    projectId: project.id,
    actorUserId: actor.id,
    clientRequestId: deterministicUuid(`${project.id}:insta360-source-story-board-v1`),
    title: "Homer's Insta360 story selects",
    description: "Browse complete 360 takes, save exact moments and camera directions, then arrange the story without touching originals.",
    slug: "homer-insta360-selects",
    kind: "episode-source-story",
  });
  const board = await prisma.studioStoryBoard.findUniqueOrThrow({ where: { id: boardResult.board.id } });
  let card = await prisma.studioStoryCard.findFirst({ where: { projectId: project.id, title: "Micro take · spatial composition proof", archivedAt: null }, include: { sourceRange: true } });
  if (!card) {
    const created = await createSourceStoryCard({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      value: {
        projectId: project.id,
        sourceRevisionId: browse.sourceRevisionId,
        sourceSetId: sourceSetResult.sourceSet.id,
        externalReferenceId: browse.reference.id,
        boardId: board.id,
        expectedBoardRevision: board.revision,
        clientRequestId: deterministicUuid(`${project.id}:${captureKey}:spatial-card-v1`),
        title: "Micro take · spatial composition proof",
        synopsis: "A retained 360 source range with two source-time camera directions, ready for story arrangement and later full-quality rendering.",
        notes: "Dogfood proof over one real Insta360 INSV plus its real LRV. The card points at the complete package; the browser only sees a verified 2:1 derivative.",
        purpose: "b-roll",
        startSeconds: 0.05,
        endSeconds: 0.35,
        groupKey: "spatial-selects",
        laneKey: "story",
        tagIds: [],
        reframeRecipe: {
          schema: "quipsly-360-reframe-v1",
          projection: "equirectangular",
          aspectRatio: "16:9",
          stabilization: "source",
          horizonLock: true,
          keyframes: [
            { sourceSeconds: 0.08, panDegrees: -18, tiltDegrees: 2, rollDegrees: 0, fieldOfViewDegrees: 74, interpolation: "ease" },
            { sourceSeconds: 0.30, panDegrees: 24, tiltDegrees: -1, rollDegrees: 0, fieldOfViewDegrees: 62, interpolation: "ease" },
          ],
        },
      },
    });
    card = await prisma.studioStoryCard.findUnique({ where: { id: created.card.id }, include: { sourceRange: true } });
  }
  if (!card?.sourceRange || card.sourceRange.sourceSetId !== sourceSetResult.sourceSet.id) throw new Error("The story card did not retain its exact source-set identity.");

  let episodeDocument = await prisma.studioDocument.findUnique({ where: { stableId: `source-story-spatial-promotion-dogfood-${project.id}` } });
  if (!episodeDocument) {
    episodeDocument = await prisma.studioDocument.create({
      data: {
        projectId: project.id,
        stableId: `source-story-spatial-promotion-dogfood-${project.id}`,
        title: "Source Story spatial promotion dogfood",
        projectionStatus: "review",
        isPrivate: false,
      },
    });
  }
  const episode = await prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: project.id, slug: "source-story-spatial-promotion-qa-20260807" } },
    update: {},
    create: {
      projectId: project.id,
      documentId: episodeDocument.id,
      slug: "source-story-spatial-promotion-qa-20260807",
      title: "Source Story spatial promotion QA",
      boundaryLabel: "Source Story spatial promotion QA",
      status: "draft",
    },
  });
  const boardPlacement = await prisma.studioStoryBoardPlacement.findFirstOrThrow({ where: { boardId: board.id, cardId: card.id } });
  const promotionRequestId = deterministicUuid(`${project.id}:${card.id}:${episode.id}:timeline-promotion-v5-canonical-relation-identity`);
  const existingPromotion = await prisma.studioStoryTimelinePlacement.findUnique({
    where: { episodeProductionId_createdByUserId_clientRequestId: { episodeProductionId: episode.id, createdByUserId: actor.id, clientRequestId: promotionRequestId } },
    select: { timelineFingerprintBeforeSha256: true },
  });
  if (!existingPromotion) {
    const supersededPlacements = await prisma.studioStoryTimelinePlacement.findMany({
      where: { episodeProductionId: episode.id, cardId: card.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    for (const superseded of supersededPlacements) {
      const beforeWithdrawal = await readSourceStoryWorkspace(prisma, project.id);
      const episodeBeforeWithdrawal = beforeWithdrawal.episodes.find((candidate) => candidate.id === episode.id);
      if (!episodeBeforeWithdrawal) throw new Error("The retained QA Episode disappeared before superseded placement withdrawal.");
      await withdrawSourceStoryTimelinePlacement({
        prisma,
        actorUserId: actor.id,
        value: {
          projectId: project.id,
          placementId: superseded.id,
          expectedRevision: superseded.revision,
          expectedTimelineFingerprint: episodeBeforeWithdrawal.timelineFingerprint,
          clientRequestId: deterministicUuid(`${project.id}:${superseded.id}:withdraw-for-canonical-relation-identity-v5`),
        },
      });
    }
  }
  const workspaceBeforePromotion = await readSourceStoryWorkspace(prisma, project.id);
  const episodeBeforePromotion = workspaceBeforePromotion.episodes.find((candidate) => candidate.id === episode.id);
  if (!episodeBeforePromotion) throw new Error("The retained QA Episode did not project into Source Story.");
  const promotion = await promoteSourceStoryCardToEpisode({
    prisma,
    actorUserId: actor.id,
    actorEmail,
    value: {
      projectId: project.id,
      episodeProductionId: episode.id,
      cardId: card.id,
      originBoardId: board.id,
      originBoardPlacementId: boardPlacement.id,
      clientRequestId: promotionRequestId,
      expectedTimelineFingerprint: existingPromotion?.timelineFingerprintBeforeSha256 ?? episodeBeforePromotion.timelineFingerprint,
      placementMode: "append",
      trackId: "V1",
    },
  });

  const [workspace, originalShaAfter, browseShaAfter, derivativeStat, derivativeSha] = await Promise.all([
    readSourceStoryWorkspace(prisma, project.id),
    sha256File(originalPath),
    sha256File(browsePath),
    stat(derivative.locator),
    sha256File(derivative.locator),
  ]);
  const projectedSet = workspace.sourceSets.find((candidate) => candidate.id === sourceSetResult.sourceSet.id);
  if (!projectedSet?.sourceClockRevision.collaborationProxy) throw new Error("The spatial source set is missing its protected browse derivative.");
  if (originalShaAfter !== original.checksumSha256 || browseShaAfter !== browse.checksumSha256) throw new Error("An original package member changed during dogfood.");
  if (derivativeSha !== derivative.contentSha256 || derivativeStat.size !== Number(derivative.sizeBytes)) throw new Error("The spatial derivative bytes do not match their receipt.");
  const serialized = JSON.stringify(projectedSet);
  if (serialized.includes(packageDirectory) || serialized.includes(original.cachePath) || serialized.includes(browse.cachePath)) throw new Error("A server-local path leaked into the browser projection.");

  const appReadback = await verifyAuthenticatedAppBoundary({
    prisma,
    project,
    createdBy: actor,
    sourceSetId: sourceSetResult.sourceSet.id,
    boardId: board.id,
    derivative,
    derivativeStat,
    episode,
    placementId: promotion.placement.id,
  });

  console.log(JSON.stringify({
    schema: "quipsly-retained-insta360-source-story-operation-v1",
    project: project.name,
    sourceSetId: sourceSetResult.sourceSet.id,
    sourceSetIdentitySha256: sourceSetResult.sourceSet.identitySha256,
    sourceSetReplayed: sourceSetResult.replayed,
    captureKey,
    members: projectedSet.members.map((member) => ({ role: member.role, fileName: member.sourceRevision.externalReference?.fileName, sizeBytes: member.sourceRevision.sizeBytes, contentSha256: member.sourceRevision.contentSha256, requiredForRender: member.requiredForRender })),
    sourceClockRevisionId: browse.sourceRevisionId,
    spatialDerivative: { id: derivative.id, widthPixels: derivative.widthPixels, heightPixels: derivative.heightPixels, durationSeconds: derivative.durationSeconds, sizeBytes: derivative.sizeBytes.toString(), contentSha256: derivative.contentSha256 },
    boardId: board.id,
    cardId: card.id,
    episodeId: episode.id,
    episodeSlug: episode.slug,
    timelinePlacementId: promotion.placement.id,
    timelinePlacementReplayed: promotion.replayed,
    sourceRange: [card.sourceRange.startSeconds, card.sourceRange.endSeconds],
    reframeKeyframes: Array.isArray(card.sourceRange.reframeRecipeJson?.keyframes) ? card.sourceRange.reframeRecipeJson.keyframes.length : 0,
    originalPackageMutated: false,
    serverPathExposed: false,
    appReadback,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
