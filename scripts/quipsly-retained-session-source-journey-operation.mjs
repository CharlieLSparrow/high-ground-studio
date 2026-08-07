#!/usr/bin/env node

const enabled = process.env.QUIPSLY_RETAINED_SOURCE_JOURNEY_OPERATION === "1";
if (!enabled) {
  throw new Error("Set QUIPSLY_RETAINED_SOURCE_JOURNEY_OPERATION=1 to inspect retained local Session source journeys.");
}

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname)) {
  throw new Error("The retained source-journey operation requires loopback PostgreSQL and refuses remote databases.");
}
process.env.DATABASE_URL = databaseURL.toString();

const ROOM_ID = "cmsfpfwrt000db9xld8ppuon4";
const EXPECTED_CAPTURE_GROUP_ID = "967f72b2-f762-4535-a337-e69b5676cad1";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const { buildSessionReadinessTopology } = await import("../apps/quipsly/src/app/(app)/sessions/[roomId]/session-readiness-topology.ts");
const { buildSessionSourceEvidence } = await import("../apps/quipsly/src/app/(app)/sessions/[roomId]/session-source-evidence-model.ts");
const { buildSessionSourceJourneyProjection } = await import("../apps/quipsly/src/app/(app)/sessions/[roomId]/session-source-journey.ts");
const { buildSessionRecordingHealth } = await import("../apps/quipsly/src/app/(app)/sessions/[roomId]/session-recording-health.ts");
const { loadSessionEpisodeAssemblyEvidence } = await import("../apps/quipsly/src/app/(app)/sessions/[roomId]/session-episode-assembly-evidence-loader.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function latestConsentForParticipant(consents, participantId) {
  return consents
    .filter((consent) => consent.participantId === participantId)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
}

const prisma = getPrismaClient();
try {
  const [room, finalizationReceipts, operator] = await Promise.all([
    prisma.callRoom.findUnique({
      where: { id: ROOM_ID },
      include: {
        project: { select: { id: true, slug: true } },
        episodeProduction: { select: { id: true, slug: true, title: true } },
        participants: { where: { accessStatus: "ACTIVE" }, include: { user: { select: { name: true, primaryEmail: true } } } },
        participantProviderGrants: { orderBy: { issuedAt: "desc" }, take: 200 },
        participantPreflightReceipts: { orderBy: { testedAt: "desc" }, take: 200 },
        endpointQueueReceipts: { orderBy: { queueRevision: "desc" }, take: 500 },
        expectedSources: { orderBy: [{ status: "asc" }, { createdAt: "asc" }], take: 200 },
        recordingAssets: { orderBy: { createdAt: "asc" } },
        recordingConsents: { orderBy: { updatedAt: "desc" } },
        stateReceipts: { where: { captureId: { not: null } }, orderBy: { sequence: "asc" } },
        transcriptJobs: { orderBy: { updatedAt: "desc" }, take: 100, include: { _count: { select: { segments: true } } } },
      },
    }),
    prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { roomId: ROOM_ID },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { primaryEmail: OPERATOR_EMAIL },
      select: { id: true, primaryEmail: true, name: true },
    }),
  ]);
  assert(room, `Retained Session ${ROOM_ID} is missing.`);
  assert(operator, `Retained operator ${OPERATOR_EMAIL} is missing.`);
  assert(room.captureGroupId === EXPECTED_CAPTURE_GROUP_ID, `Capture-group drift: ${room.captureGroupId}`);
  assert(room.project && room.episodeProduction, "The retained Session lost its canonical project or Episode relationship.");

  const captureGroups = new Map();
  for (const receipt of room.stateReceipts) {
    if (!receipt.captureId || receipt.outcome !== "APPLIED" || !receipt.stateApplied) continue;
    const captureId = String(receipt.captureId).toLowerCase();
    const current = captureGroups.get(captureId) ?? {
      captureId,
      actorUserId: receipt.captureOwnerUserId || receipt.actorUserId,
      startedAt: null,
      stoppedAt: null,
      lastReceivedAt: receipt.receivedAt,
    };
    if (String(receipt.action) === "START_RECORDING") current.startedAt = receipt.occurredAt;
    if (String(receipt.action) === "STOP_RECORDING") current.stoppedAt = receipt.occurredAt;
    if (receipt.receivedAt > current.lastReceivedAt) current.lastReceivedAt = receipt.receivedAt;
    captureGroups.set(captureId, current);
  }

  const topology = buildSessionReadinessTopology({
    participants: room.participants.map((participant) => {
      const consent = latestConsentForParticipant(room.recordingConsents, participant.id);
      return {
        id: participant.id,
        userId: participant.userId,
        label: participant.displayName || participant.user?.name || participant.email || participant.user?.primaryEmail || "Session participant",
        role: String(participant.role),
        isCurrentActor: participant.userId === operator.id,
        consent: consent ? {
          recordingReady: String(consent.status) === "GRANTED" && !consent.revokedAt && consent.canRecordAudio,
          canRecordVideo: String(consent.status) === "GRANTED" && !consent.revokedAt && consent.canRecordVideo,
          transcriptionReady: String(consent.status) === "GRANTED" && !consent.revokedAt && consent.canTranscribe,
        } : null,
      };
    }),
    grants: room.participantProviderGrants,
    preflights: room.participantPreflightReceipts,
    endpointQueues: room.endpointQueueReceipts,
    expectedSources: room.expectedSources,
    recordings: room.recordingAssets,
    finalizations: finalizationReceipts,
    captures: [...captureGroups.values()].map((capture) => ({
      captureId: capture.captureId,
      actorUserId: capture.actorUserId,
      status: capture.startedAt && capture.stoppedAt ? "START_AND_STOP_RECEIVED" : capture.startedAt ? "START_ONLY" : "STOP_ONLY",
      startedAt: capture.startedAt,
      stoppedAt: capture.stoppedAt,
      lastReceivedAt: capture.lastReceivedAt,
    })),
  });
  const sourceEvidence = buildSessionSourceEvidence({
    roomId: room.id,
    recordingAssets: room.recordingAssets,
    finalizationReceipts,
    stateReceipts: room.stateReceipts,
  });
  const assembly = await loadSessionEpisodeAssemblyEvidence({
    prisma,
    roomId: room.id,
    projectId: room.project.id,
    projectSlug: room.project.slug,
    episodeSlug: room.episodeProduction.slug,
    captureGroupId: room.captureGroupId,
    actor: {
      id: operator.id,
      email: operator.primaryEmail,
      name: operator.name || operator.primaryEmail,
      isStaff: true,
      source: "retained-local-operation",
    },
  });
  const finishingEvidence = {
    transcriptJobs: room.transcriptJobs.map((job) => ({
      id: job.id,
      recordingAssetId: job.assetId,
      status: String(job.status),
      segmentCount: job._count.segments,
      updatedAt: job.updatedAt.toISOString(),
    })),
    outputs: [],
    analyzedSourceCount: 0,
    assembly: assembly ?? undefined,
  };
  const projection = buildSessionSourceJourneyProjection({
    topology,
    sourceEvidence,
    finishingEvidence,
  });
  const recordingHealth = buildSessionRecordingHealth({ topology, sourceEvidence });

  assert(topology.expectedSources.length === 2, `Expected two declared recovered masters, observed ${topology.expectedSources.length}.`);
  assert(sourceEvidence.sources.length >= 4, `Expected retained current and historical sources, observed ${sourceEvidence.sources.length}.`);
  assert(projection.journeys.length >= 4, `Expected at least four source journeys, observed ${projection.journeys.length}.`);
  assert(assembly?.selectedRecordingAssetIds?.length === 2, `Expected two exact selected RecordingAssets, observed ${assembly?.selectedRecordingAssetIds?.length ?? 0}.`);
  const selectedIds = new Set(assembly.selectedRecordingAssetIds);
  const selectedJourneys = projection.journeys.filter((journey) => journey.recordingAssetId && selectedIds.has(journey.recordingAssetId));
  const historicalJourneys = projection.journeys.filter((journey) => journey.recordingAssetId && !selectedIds.has(journey.recordingAssetId));
  const selectedEditorCheckpoints = selectedJourneys.map((journey) => journey.checkpoints.find((checkpoint) => checkpoint.id === "assembly"));
  assert(selectedJourneys.length === 2, `Expected two selected source journeys, observed ${selectedJourneys.length}.`);
  assert(historicalJourneys.length >= 2, `Expected preserved historical journeys, observed ${historicalJourneys.length}.`);
  assert(
    selectedEditorCheckpoints.every((checkpoint) => checkpoint && ["COMPLETE", "CURRENT", "HELD"].includes(checkpoint.state)),
    `A selected recovered source was not projected into canonical editor evidence: ${JSON.stringify({ assemblyState: assembly.state, checkpoints: selectedEditorCheckpoints })}`,
  );
  assert(selectedEditorCheckpoints.every((checkpoint) => checkpoint?.state !== "HELD") || assembly.state === "BLOCKED", "A selected Editor checkpoint was held without a canonical assembly blocker.");
  assert(selectedEditorCheckpoints.every((checkpoint) => checkpoint?.state !== "CURRENT") || assembly.state === "READY_TO_MATERIALIZE", "A selected Editor checkpoint was current without a conflict-safe materialization path.");
  assert(historicalJourneys.every((journey) => journey.checkpoints.find((checkpoint) => checkpoint.id === "assembly")?.state === "NOT_APPLICABLE"), "A historical source was falsely projected onto the selected editor take.");
  assert(recordingHealth.sources.length >= 4, `Expected recording-health evidence for retained current and historical sources, observed ${recordingHealth.sources.length}.`);
  assert(recordingHealth.sources.every((source) => source.gates.length === 6), "A retained source lost one or more independently inspectable Audio Flight Deck gates.");
  assert(recordingHealth.sources.every((source) => source.state !== "READY" || source.gates.every((gate) => gate.state === "READY")), "The Audio Flight Deck called a retained source ready while one of its gates was not ready.");
  assert(recordingHealth.boundaries.noUniversalQualityScore, "The retained operation lost the no-universal-quality-score boundary.");

  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    readOnly: true,
    roomId: room.id,
    captureGroupId: room.captureGroupId,
    episode: room.episodeProduction.slug,
    plannedSources: topology.expectedSources.length,
    retainedSources: sourceEvidence.sources.length,
    journeys: projection.journeys.map((journey) => ({
      label: journey.label,
      recordingAssetId: journey.recordingAssetId,
      state: journey.state,
      checkpoints: Object.fromEntries(journey.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.state])),
    })),
    selectedRecordingAssetIds: [...selectedIds],
    assemblyState: assembly.state,
    assemblyNextAction: assembly.nextAction,
    historicalSourcesPreservedOutsideTake: historicalJourneys.length,
    recordingHealth: {
      state: recordingHealth.state,
      counts: recordingHealth.counts,
      sources: recordingHealth.sources.map((source) => ({
        label: source.label,
        recordingAssetId: source.recordingAssetId,
        state: source.state,
        gates: Object.fromEntries(source.gates.map((gate) => [gate.id, gate.state])),
        nextAction: source.nextAction,
      })),
      universalQualityScoreEmitted: false,
    },
    sourceStateMutated: false,
    publicationStarted: false,
    secretsPrinted: false,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
