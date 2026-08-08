import { createHash, randomUUID } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { buildEpisodeArtifactPayload, normalizeEpisodeArtifact, timelineStateFromEpisodeArtifact } from "../apps/quipsly/src/app/(app)/episode-production/episodeArtifact.ts";
import { getPrismaClient } from "../apps/quipsly/src/lib/prisma.ts";
import { promoteSourceStoryCardToEpisode, readSourceStoryWorkspace } from "../apps/quipsly/src/lib/server/source-story.ts";

const appOrigin = process.env.QUIPSLY_APP_ORIGIN || "http://127.0.0.1:3012";
const databaseUrl = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) throw new Error("Source Story editor handoff dogfood refuses a non-local database.");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(appOrigin).hostname)) throw new Error("Source Story editor handoff dogfood refuses a non-loopback app.");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(authOrigin).hostname)) throw new Error("Source Story editor handoff dogfood refuses a non-loopback Firebase emulator.");
process.env.DATABASE_URL = databaseUrl.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;
process.env.GCLOUD_PROJECT = "quipsly-reef";
process.env.GOOGLE_CLOUD_PROJECT = "quipsly-reef";

const prisma = getPrismaClient();
const email = "source-story-editor-handoff@quipsly.test";
const password = `Local-only-${randomUUID()}!`;
let firebaseApp = null;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function deterministicUuid(seed) {
  const hex = sha256(seed).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

async function createSession(actor) {
  firebaseApp = initializeApp({ projectId: "quipsly-reef" }, `source-story-editor-handoff-${randomUUID().slice(0, 8)}`);
  const auth = getAuth(firebaseApp);
  const uid = "source-story-editor-handoff";
  const existing = await auth.getUser(uid).catch(() => null);
  if (existing) await auth.updateUser(uid, { email, emailVerified: true, password, displayName: "Source Story editor handoff" });
  else await auth.createUser({ uid, email, emailVerified: true, password, displayName: "Source Story editor handoff" });
  const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signedIn = await signIn.json();
  if (!signIn.ok || !signedIn.idToken) throw new Error("Could not sign the retained editor operator into the Firebase emulator.");
  const session = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: signedIn.idToken }),
  });
  const body = await session.json();
  const cookie = session.headers.getSetCookie().find((value) => value.startsWith("session=") && !value.startsWith("session=;"))?.split(";")[0];
  if (!session.ok || body.success !== true || !cookie) throw new Error(`Could not establish the retained editor session for ${actor.id}.`);
  return cookie;
}

async function postEpisode(cookie, body) {
  const response = await fetch(`${appOrigin}/api/episode-production`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "cache-control": "no-cache" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function savedArtifact(currentPayload, nextClips, projectSlug, episodeSlug, label) {
  const currentTimeline = timelineStateFromEpisodeArtifact(currentPayload);
  const artifact = buildEpisodeArtifactPayload({
    timeline: { ...currentTimeline, clips: nextClips },
    projectSlug,
    episodeSlug,
    generatedFrom: label,
    savedAt: new Date().toISOString(),
    source: "quipsly-editor",
  });
  artifact.importedMedia = normalizeEpisodeArtifact(currentPayload)?.importedMedia ?? [];
  return artifact;
}

async function save(cookie, state, artifact) {
  const before = normalizeEpisodeArtifact(state.timelineJson)?.contentFingerprint || "";
  const after = artifact.contentFingerprint || "";
  return postEpisode(cookie, {
    action: "save-timeline",
    productionId: state.id,
    projectSlug: state.projectSlug,
    episodeSlug: state.slug,
    timelineJson: artifact,
    transcriptJson: artifact,
    expectedTimelineFingerprint: before,
    editReviewSaveRequestId: randomUUID(),
    editReviewReceiptIds: [],
    editReviewSaveMode: "manual",
    timelineFingerprintBeforeSha256: sha256(before),
    timelineFingerprintAfterSha256: sha256(after),
  });
}

try {
  const project = await prisma.studioProject.findFirstOrThrow({ where: { slug: "high-ground-odyssey" } });
  const creator = await prisma.user.findFirstOrThrow({ where: { primaryEmail: { not: email } }, orderBy: { createdAt: "asc" } });
  const actor = await prisma.user.upsert({
    where: { primaryEmail: email },
    update: { name: "Source Story editor handoff" },
    create: { primaryEmail: email, name: "Source Story editor handoff" },
  });
  await prisma.studioProjectAccessGrant.upsert({
    where: { projectId_email: { projectId: project.id, email } },
    update: { role: "EDITOR", status: "ACTIVE" },
    create: { projectId: project.id, email, role: "EDITOR", status: "ACTIVE", createdByUserId: creator.id, createdByEmail: creator.primaryEmail, note: "Loopback-only source-to-editor retained operation." },
  });
  const card = await prisma.studioStoryCard.findFirstOrThrow({
    where: { projectId: project.id, archivedAt: null, sourceRange: { isNot: null } },
    orderBy: { updatedAt: "desc" },
    include: { sourceRange: true, placements: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!card.sourceRange) throw new Error("The retained HGO Story card has no exact source range.");
  const boardPlacement = card.placements[0] || null;
  const slug = "source-story-editor-handoff-qa-20260808";
  const stableId = `source-story-editor-handoff-${project.id}`;
  const document = await prisma.studioDocument.upsert({
    where: { stableId },
    update: {},
    create: { projectId: project.id, stableId, title: "Source Story editor handoff QA", projectionStatus: "review", isPrivate: false },
  });
  const episode = await prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: project.id, slug } },
    update: {},
    create: { projectId: project.id, documentId: document.id, slug, title: "Source Story editor handoff QA", boundaryLabel: "Source Story editor handoff QA", status: "draft" },
  });
  let placement = await prisma.studioStoryTimelinePlacement.findFirst({ where: { episodeProductionId: episode.id, cardId: card.id }, orderBy: { createdAt: "desc" } });
  if (!placement) {
    const workspace = await readSourceStoryWorkspace(prisma, project.id);
    const projection = workspace.episodes.find((candidate) => candidate.id === episode.id);
    if (!projection) throw new Error("The QA Episode did not project into Source Story.");
    const promoted = await promoteSourceStoryCardToEpisode({
      prisma,
      actorUserId: actor.id,
      actorEmail: email,
      value: {
        projectId: project.id,
        episodeProductionId: episode.id,
        cardId: card.id,
        originBoardId: boardPlacement?.boardId ?? null,
        originBoardPlacementId: boardPlacement?.id ?? null,
        clientRequestId: deterministicUuid(`${episode.id}:${card.id}:source-story-editor-handoff-v1`),
        expectedTimelineFingerprint: projection.timelineFingerprint,
        placementMode: "append",
        trackId: "V2",
      },
    });
    placement = await prisma.studioStoryTimelinePlacement.findUniqueOrThrow({ where: { id: promoted.placement.id } });
  }

  const cookie = await createSession(actor);
  const ensured = await postEpisode(cookie, { action: "ensure", projectSlug: project.slug, episodeSlug: slug, title: episode.title });
  if (!ensured.response.ok || ensured.payload.mode !== "database") throw new Error(`Could not open retained QA Episode (HTTP ${ensured.response.status}).`);
  const originalClip = timelineStateFromEpisodeArtifact(ensured.payload.timelineJson).clips.find((clip) => clip.id === placement.clipId);
  if (!originalClip?.sourceStory) throw new Error("The retained QA Episode has no Source Story clip binding.");
  if (originalClip.sourceStory.sourceRangeStartSeconds === undefined || originalClip.sourceStory.sourceRangeEndSeconds === undefined) throw new Error("The new promotion did not expose its immutable retained range to the editor.");
  const trimmed = {
    ...originalClip,
    trackId: "V3",
    startIn: 7.25,
    sourceStart: originalClip.sourceStory.sourceRangeStartSeconds + 0.25,
    sourceEnd: originalClip.sourceStory.sourceRangeEndSeconds - 0.25,
    duration: originalClip.sourceStory.sourceRangeEndSeconds - originalClip.sourceStory.sourceRangeStartSeconds - 0.5,
  };
  const priorOperations = await prisma.studioStoryTimelinePlacementOperation.findMany({ where: { placementId: placement.id }, select: { operation: true } });
  const alreadyReconciled = ["timeline-reconcile", "editor-withdraw", "editor-restore"].every((operation) => priorOperations.some((candidate) => candidate.operation === operation))
    && originalClip.trackId === trimmed.trackId
    && originalClip.startIn === trimmed.startIn
    && originalClip.sourceStart === trimmed.sourceStart
    && originalClip.sourceEnd === trimmed.sourceEnd;
  let restoredPayload = ensured.payload;
  if (!alreadyReconciled) {
    const movedArtifact = savedArtifact(ensured.payload.timelineJson, [trimmed], project.slug, slug, "retained-source-story-editor-move");
    const moved = await save(cookie, ensured.payload, movedArtifact);
    if (!moved.response.ok || moved.payload.sourceStoryReconciliation?.reconciled !== 1) throw new Error(`Editor move/trim did not reconcile (HTTP ${moved.response.status}: ${moved.payload.errorCode || "no-summary"}).`);
    const deletedArtifact = savedArtifact(moved.payload.timelineJson, [], project.slug, slug, "retained-source-story-editor-delete");
    const deleted = await save(cookie, moved.payload, deletedArtifact);
    if (!deleted.response.ok || deleted.payload.sourceStoryReconciliation?.withdrawn !== 1) throw new Error(`Editor deletion did not create a reversible withdrawal (HTTP ${deleted.response.status}).`);
    const restoredArtifact = savedArtifact(deleted.payload.timelineJson, [trimmed], project.slug, slug, "retained-source-story-editor-restore");
    const restored = await save(cookie, deleted.payload, restoredArtifact);
    if (!restored.response.ok || restored.payload.sourceStoryReconciliation?.restored !== 1) throw new Error(`Editor restore did not reactivate the placement (HTTP ${restored.response.status}).`);
    restoredPayload = restored.payload;
  }
  const strippedArtifact = savedArtifact(restoredPayload.timelineJson, [{ ...trimmed, sourceStory: undefined }], project.slug, slug, "retained-source-story-editor-invalid-strip");
  const stripped = await save(cookie, restoredPayload, strippedArtifact);
  if (stripped.response.status !== 409 || stripped.payload.errorCode !== "SOURCE_STORY_BINDING_REMOVED") throw new Error(`Provenance stripping did not fail closed (HTTP ${stripped.response.status}: ${stripped.payload.errorCode || "unknown"}).`);
  const sourceParams = new URLSearchParams();
  if (originalClip.sourceStory.sourceSetId) sourceParams.set("set", originalClip.sourceStory.sourceSetId);
  else if (originalClip.sourceStory.externalReferenceId) sourceParams.set("external", originalClip.sourceStory.externalReferenceId);
  else if (originalClip.sourceStory.mediaAssetId) sourceParams.set("asset", originalClip.sourceStory.mediaAssetId);
  if (originalClip.sourceStory.originBoardId) sourceParams.set("board", originalClip.sourceStory.originBoardId);
  sourceParams.set("card", card.id);
  const sourceStoryHref = `/nests/${encodeURIComponent(project.slug)}/story?${sourceParams.toString()}#story-card-${encodeURIComponent(card.id)}`;
  const sourceStoryPage = await fetch(`${appOrigin}${sourceStoryHref}`, { headers: { cookie, "cache-control": "no-cache" } });
  const sourceStoryHtml = await sourceStoryPage.text();
  if (!sourceStoryPage.ok || !sourceStoryHtml.includes(card.id) || !sourceStoryHtml.includes(card.title)) throw new Error(`The exact-card Source Story return route did not render its retained card (HTTP ${sourceStoryPage.status}).`);

  const [readback, operations] = await Promise.all([
    prisma.studioStoryTimelinePlacement.findUniqueOrThrow({ where: { id: placement.id } }),
    prisma.studioStoryTimelinePlacementOperation.findMany({ where: { placementId: placement.id }, orderBy: { revision: "asc" }, select: { revision: true, operation: true } }),
  ]);
  console.log(JSON.stringify({
    schema: "quipsly-retained-source-story-editor-handoff-v1",
    projectSlug: project.slug,
    episodeSlug: slug,
    cardId: card.id,
    placementId: placement.id,
    sourceSetId: originalClip.sourceStory.sourceSetId,
    retainedRange: [originalClip.sourceStory.sourceRangeStartSeconds, originalClip.sourceStory.sourceRangeEndSeconds],
    editorUse: [trimmed.sourceStart, trimmed.sourceEnd],
    editorPlacement: { trackId: readback.trackId, startIn: readback.episodeStartSeconds, duration: readback.durationSeconds, status: readback.status, revision: readback.revision },
    sourceStoryHref,
    sourceStoryPageStatus: sourceStoryPage.status,
    operations,
    rejectedMutation: stripped.payload.errorCode,
    sourceMediaUnchanged: true,
    publicationNotStarted: true,
  }, null, 2));
} finally {
  if (firebaseApp) await deleteApp(firebaseApp);
  await prisma.$disconnect();
}
