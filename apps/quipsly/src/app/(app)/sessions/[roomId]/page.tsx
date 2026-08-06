import Link from "next/link";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { notFound, unstable_rethrow } from "next/navigation";
import { readLastTranscriptMergedNoteSource, readTranscriptDerivedNoteSource } from "@high-ground/quipsly-domain/transcript-derived-task";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA } from "@/lib/server/mobile-capture-quick-entry";
import { recordingContentReadiness } from "@/lib/server/mobile-capture-content-readiness";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";
import { sessionRelationMatchesProject } from "@/lib/server/session-episode-binding";
import { loadSessionContinuityState } from "@/lib/server/session-continuity";
import {
  canUseProjectTeamNotes,
  sessionNoteVisibilityWhere,
} from "@/lib/server/session-note-access";

import { SessionReviewClient } from "./session-review-client";
import {
  buildSessionCollaborationContext,
  episodeSlugFromSessionMetadata,
} from "./session-collaboration-model";
import {
  parseSessionNoteView,
  type SessionNoteKind,
  type SessionNoteVisibility,
} from "./session-notes-model";
import { buildSessionPreparationState } from "./session-preparation-model";
import { buildSessionSourceEvidence } from "./session-source-evidence-model";
import { buildSessionReadinessTopology } from "./session-readiness-topology";
import { parseSessionWorkspaceMode } from "./session-workspace-model";

export const dynamic = "force-dynamic";

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "ECONNREFUSED" || message.includes("ECONNREFUSED")
    ? "The workspace database connection is unavailable."
    : "Quipsly could not read this private session.";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function SessionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ mode?: string | string[]; view?: string | string[]; joined?: string | string[] }>;
}) {
  const [{ roomId }, query] = await Promise.all([params, searchParams]);
  const workspaceMode = parseSessionWorkspaceMode(query.mode);
  const sessionNoteView = parseSessionNoteView(query.view);
  const joinedFromInvitation = (Array.isArray(query.joined) ? query.joined[0] : query.joined) === "1";
  const session = await getQuipslySession();
  if (!session?.user) {
    return <main className="min-h-full px-6 py-10 lg:px-10"><section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8" role="status"><LockKeyhole className="text-amber-700" aria-hidden="true" /><h1 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">This session review is private.</h1><p className="mt-2 font-semibold text-[#765f40]">Sign in before reading consent, transcript evidence, candidates, or committed tasks.</p><Link href={`/login?callbackUrl=${encodeURIComponent(`/sessions/${roomId}`)}`} className="mt-5 inline-flex rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link></section></main>;
  }

  try {
    const prisma = getPrismaClient() as any;
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const room = await prisma.callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        captureGroupId: true,
        title: true,
        purpose: true,
        status: true,
        provider: true,
        providerRoomId: true,
        episodeProductionId: true,
        coachingEngagementId: true,
        episodeProduction: { select: { id: true, projectId: true, title: true, slug: true } },
        coachingEngagement: { select: { id: true, title: true, status: true, project: { select: { slug: true } } } },
        episodeBindingReceipts: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            action: true,
            previousEpisodeSlug: true,
            nextEpisodeSlug: true,
            reason: true,
            createdAt: true,
          },
        },
        metadataJson: true,
        scheduledStart: true,
        scheduledEnd: true,
        createdByUserId: true,
        updatedAt: true,
        project: { select: { id: true, name: true, slug: true } },
        participants: {
          where: { accessStatus: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            displayName: true,
            email: true,
            role: true,
            joinedAt: true,
            user: { select: { name: true, primaryEmail: true } },
          },
        },
        participantProviderGrants: {
          orderBy: { issuedAt: "desc" },
          take: 200,
          select: {
            id: true,
            participantId: true,
            clientInstanceId: true,
            clientKind: true,
            deviceLabel: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, category: true, projectId: true } } } },
        recordingAssets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            roomId: true,
            participantId: true,
            fileName: true,
            kind: true,
            status: true,
            contentType: true,
            byteSize: true,
            durationSeconds: true,
            storageBucket: true,
            storageObjectPath: true,
            checksum: true,
            verifiedAt: true,
            recordedStartedAt: true,
            recordedStoppedAt: true,
            localManifestJson: true,
            segmentsJson: true,
          },
        },
        recordingConsents: {
          select: {
            id: true,
            participantId: true,
            userId: true,
            status: true,
            policyVersion: true,
            canRecordAudio: true,
            canRecordVideo: true,
            canTranscribe: true,
            consentedAt: true,
            revokedAt: true,
            updatedAt: true,
            metadataJson: true,
          },
        },
        stateReceipts: {
          where: { captureId: { not: null } },
          orderBy: { sequence: "asc" },
          select: {
            receiptId: true,
            captureId: true,
            actorUserId: true,
            captureOwnerUserId: true,
            action: true,
            outcome: true,
            stateApplied: true,
            occurredAt: true,
            receivedAt: true,
          },
        },
      },
    });
    if (!room) notFound();

    const finalizationReceipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { roomId: room.id },
      orderBy: { updatedAt: "desc" },
      select: {
        uploadSessionId: true,
        captureId: true,
        roomId: true,
        actorUserId: true,
        startReceiptId: true,
        processingDisposition: true,
        transcriptDisposition: true,
        recordingAssetId: true,
        releaseReason: true,
        releasedAt: true,
        transcriptReleaseReason: true,
        transcriptReleasedAt: true,
        metadataJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const sourceEvidence = buildSessionSourceEvidence({
      roomId: room.id,
      recordingAssets: room.recordingAssets,
      finalizationReceipts,
      stateReceipts: room.stateReceipts,
    });
    const promotedDetectorSources = room.project ? room.recordingAssets.flatMap((recording: any) => {
      const promotion = jsonObject(jsonObject(recording.localManifestJson).promotion);
      const mediaAssetId = cleanText(promotion.mediaAssetId);
      const sourceId = cleanText(promotion.sourceId);
      const playbackUrl = cleanText(promotion.playbackUrl);
      const nestSlug = cleanText(promotion.nestSlug);
      const durationSeconds = Number(recording.durationSeconds);
      if (!mediaAssetId || !sourceId || playbackUrl !== `/api/ingest/media/${sourceId}` || nestSlug !== room.project.slug || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
      return [{ mediaAssetId, sourceId, sourceUrl: playbackUrl, durationSeconds, label: recording.fileName || "Session recording" }];
    }) : [];
    const detectorAnalysisRows = room.project && promotedDetectorSources.length && typeof prisma.studioAudibleEventAnalysisReceipt?.findMany === "function" ? await prisma.studioAudibleEventAnalysisReceipt.findMany({
      where: { projectId: room.project.id, sourceId: { in: promotedDetectorSources.map((source: any) => source.sourceId) } },
      select: { assetId: true, sourceId: true },
      distinct: ["sourceId"],
    }) : [];
    const detectorAnalysisKeys = new Set(detectorAnalysisRows.map((row: any) => `${row.assetId}:${row.sourceId}`));
    const audibleEventSources = room.project ? promotedDetectorSources
      .filter((source: any) => detectorAnalysisKeys.has(`${source.mediaAssetId}:${source.sourceId}`))
      .map((source: any) => ({ projectSlug: room.project.slug, assetId: source.mediaAssetId, sourceId: source.sourceId, sourceUrl: source.sourceUrl, durationSeconds: source.durationSeconds, label: source.label })) : [];
    const {
      preparation: builtSessionPreparation,
      consentSnapshot,
    } = buildSessionPreparationState(room, session.user.id);
    const sessionPreparation = {
      ...builtSessionPreparation,
      updatedAt: room.updatedAt.toISOString(),
      canSchedule: session.user.isStaff || room.createdByUserId === session.user.id,
    };
    const contentReadiness = recordingContentReadiness(room.recordingAssets, room.purpose);
    const captureReceiptGroups = new Map<string, {
      captureId: string;
      actorUserId: string;
      startedAt: string | null;
      stoppedAt: string | null;
      startReceiptId: string | null;
      stopReceiptId: string | null;
      lastReceivedAt: string;
    }>();
    for (const receipt of room.stateReceipts) {
      if (!receipt.captureId || receipt.outcome !== "APPLIED" || !receipt.stateApplied) continue;
      const captureId = String(receipt.captureId).toLowerCase();
      const current = captureReceiptGroups.get(captureId) ?? {
        captureId,
        actorUserId: receipt.captureOwnerUserId || receipt.actorUserId,
        startedAt: null,
        stoppedAt: null,
        startReceiptId: null,
        stopReceiptId: null,
        lastReceivedAt: receipt.receivedAt.toISOString(),
      };
      if (receipt.action === "START_RECORDING") {
        current.startedAt = receipt.occurredAt.toISOString();
        current.startReceiptId = receipt.receiptId;
      }
      if (receipt.action === "STOP_RECORDING") {
        current.stoppedAt = receipt.occurredAt.toISOString();
        current.stopReceiptId = receipt.receiptId;
      }
      current.lastReceivedAt = receipt.receivedAt.toISOString();
      captureReceiptGroups.set(captureId, current);
    }
    const captureReceipts = {
      captures: Array.from(captureReceiptGroups.values())
        .map((capture) => ({
          captureId: capture.captureId,
          startedAt: capture.startedAt,
          stoppedAt: capture.stoppedAt,
          startReceiptId: capture.startReceiptId,
          stopReceiptId: capture.stopReceiptId,
          lastReceivedAt: capture.lastReceivedAt,
          status: capture.startedAt && capture.stoppedAt
            ? "START_AND_STOP_RECEIVED" as const
            : capture.startedAt
              ? "START_ONLY" as const
              : "STOP_ONLY" as const,
        }))
        .sort((left, right) => right.lastReceivedAt.localeCompare(left.lastReceivedAt)),
    };
    const sessionReadinessTopology = buildSessionReadinessTopology({
      participants: room.participants.map((participant: any) => {
        const prepared = sessionPreparation.participants.find((candidate) => candidate.id === participant.id);
        return {
          id: participant.id,
          userId: participant.userId,
          label: prepared?.label || participant.displayName || participant.email || "Session participant",
          role: String(participant.role),
          isCurrentActor: participant.userId === session.user.id,
          consent: prepared?.consent ? {
            recordingReady: prepared.consent.recordingReady,
            canRecordVideo: prepared.consent.canRecordVideo,
            transcriptionReady: prepared.consent.transcriptionReady,
          } : null,
        };
      }),
      grants: room.participantProviderGrants,
      recordings: room.recordingAssets,
      captures: Array.from(captureReceiptGroups.values()).map((capture) => ({
        captureId: capture.captureId,
        actorUserId: capture.actorUserId,
        status: capture.startedAt && capture.stoppedAt
          ? "START_AND_STOP_RECEIVED" as const
          : capture.startedAt
            ? "START_ONLY" as const
            : "STOP_ONLY" as const,
        startedAt: capture.startedAt,
        stoppedAt: capture.stoppedAt,
        lastReceivedAt: capture.lastReceivedAt,
      })),
    });
    const sessionContinuity = await loadSessionContinuityState({
      prisma,
      actor: session.user,
      roomId: room.id,
    });
    const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
    const visibleProject = room.project ? visibleProjects.find((project) => project.id === room.project.id) : null;
    const relationEpisode = sessionRelationMatchesProject({
      roomProjectId: room.project?.id,
      purpose: room.purpose,
      episode: room.episodeProduction,
    }) ? room.episodeProduction : null;
    const legacyBoundEpisodeSlug = room.episodeProductionId
      ? null
      : episodeSlugFromSessionMetadata(room.purpose, room.metadataJson);
    const legacyBoundEpisode = visibleProject && legacyBoundEpisodeSlug ? await prisma.studioEpisodeProduction.findUnique({
      where: { projectId_slug: { projectId: visibleProject.id, slug: legacyBoundEpisodeSlug } },
      select: { id: true, title: true, slug: true },
    }) : null;
    const boundEpisode = visibleProject && relationEpisode
      ? { id: relationEpisode.id, title: relationEpisode.title, slug: relationEpisode.slug }
      : legacyBoundEpisode;
    let episodeRepair = null;
    if (room.purpose === "PODCAST" && visibleProject && !boundEpisode) {
      const mutationAccess = await prisma.callRoom.findFirst({
        where: sessionMutationAccessWhere(room.id, session.user),
        select: { id: true },
      });
      const candidates = mutationAccess ? await prisma.studioEpisodeProduction.findMany({
        where: { projectId: visibleProject.id },
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        take: 100,
        select: { id: true, slug: true, title: true, status: true, updatedAt: true },
      }) : [];
      episodeRepair = {
        canRepair: Boolean(mutationAccess),
        roomUpdatedAt: room.updatedAt.toISOString(),
        currentEpisodeProductionId: room.episodeProductionId,
        currentRelationshipInvalid: Boolean(room.episodeProductionId),
        candidates: candidates.map((candidate: any) => ({
          id: candidate.id,
          slug: candidate.slug,
          title: candidate.title,
          status: candidate.status,
          updatedAt: candidate.updatedAt.toISOString(),
        })),
      };
    }
    const collaborationContext = buildSessionCollaborationContext({
      project: visibleProject && room.project ? room.project : null,
      episode: boundEpisode,
      engagement: room.purpose === "COACHING" && room.coachingEngagement
        ? {
            id: room.coachingEngagement.id,
            title: room.coachingEngagement.title,
            status: room.coachingEngagement.status,
            projectSlug: room.coachingEngagement.project.slug,
          }
        : null,
      episodeRepair,
      episodeBindingHistory: (room.episodeBindingReceipts || []).map((receipt: any) => ({
        id: receipt.id,
        action: receipt.action,
        previousEpisodeSlug: receipt.previousEpisodeSlug,
        nextEpisodeSlug: receipt.nextEpisodeSlug,
        reason: receipt.reason,
        createdAt: receipt.createdAt.toISOString(),
      })),
    });
    const canViewProjectTeamNotes = canUseProjectTeamNotes(
      visibleProject?.role,
      session.user.isStaff === true,
    );
    const tagCatalog = visibleProject ? await prisma.studioTag.findMany({
      where: { projectId: visibleProject.id, isActive: true },
      orderBy: [{ category: "asc" }, { label: "asc" }],
      select: { id: true, label: true, slug: true, category: true, projectId: true },
    }) : [];
    const [sessionNoteRows, quickTaskRows, quickGoalRows] = await Promise.all([
      prisma.coachingNote.findMany({
        where: {
          roomId: room.id,
          kind: { in: ["SESSION_NOTE", "FOLLOW_UP", "DECISION", "PRODUCTION"] },
          ...sessionNoteVisibilityWhere({
            actorUserId: session.user.id,
            canViewProjectTeam: canViewProjectTeamNotes,
          }),
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          authorUserId: true,
          title: true,
          body: true,
          kind: true,
          visibility: true,
          sourceJson: true,
          createdAt: true,
          updatedAt: true,
          authorUser: { select: { name: true, primaryEmail: true } },
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
          _count: { select: { revisions: true } },
        },
      }),
      prisma.actionItem.findMany({
        where: { roomId: room.id, assignedUserId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, title: true, detail: true, status: true, sourceJson: true, createdAt: true, updatedAt: true,
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
        },
      }),
      prisma.goal.findMany({
        where: { roomId: room.id, ownerUserId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, title: true, description: true, status: true, sourceJson: true, createdAt: true, updatedAt: true,
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
        },
      }),
    ]);
    const isQuickEntry = (value: unknown) => jsonObject(value).schema === MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA;
    const quickEntryTags = (row: any) => (row.tagLinks || [])
      .map((link: any) => link.tag)
      .filter((tag: any) => tag.isActive && visibleProject && tag.projectId === visibleProject.id)
      .map(({ id, label, slug }: any) => ({ id, label, slug }));
    const noteOriginLabel = (sourceJson: unknown) => {
      const source = jsonObject(sourceJson);
      if (readTranscriptDerivedNoteSource(sourceJson)) return "Transcript review";
      if (source.schema === MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA) return "iPhone Capture";
      if (source.schema === "quipsly-session-continuity-brief-v1") return "Saved continuity";
      if (source.schema === "quipsly-session-context-v2") return "Session plan";
      if (source.origin === "nest-session-notes") return "Nest Session note";
      return "Session record";
    };
    const sessionNotes = sessionNoteRows.map((row: any) => {
      const parsedSourceAnchor = readTranscriptDerivedNoteSource(row.sourceJson);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        kind: String(row.kind) as SessionNoteKind,
        visibility: String(row.visibility || "AUTHOR_PRIVATE") as SessionNoteVisibility,
        author: {
          id: row.authorUserId,
          label: row.authorUser?.name || row.authorUser?.primaryEmail || "Note author",
          isCurrentActor: row.authorUserId === session.user.id,
        },
        originLabel: noteOriginLabel(row.sourceJson),
        canEdit: row.authorUserId === session.user.id && row.kind !== "FOLLOW_UP",
        revisionCount: row._count?.revisions ?? 0,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        tags: quickEntryTags(row),
        sourceAnchor: parsedSourceAnchor?.roomId === room.id ? parsedSourceAnchor : null,
        lastMergedSource: readLastTranscriptMergedNoteSource(row.sourceJson),
      };
    });
    const sessionQuickEntries = [
      ...sessionNoteRows.filter((row: any) => row.authorUserId === session.user.id && isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "NOTE" as const, title: row.title, body: row.body, status: "CAPTURED", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), tags: quickEntryTags(row) })),
      ...quickTaskRows.filter((row: any) => isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "TASK" as const, title: row.title, body: row.detail, status: String(row.status), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), tags: quickEntryTags(row) })),
      ...quickGoalRows.filter((row: any) => isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "GOAL" as const, title: row.title, body: row.description, status: String(row.status), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), tags: quickEntryTags(row) })),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const sessionTaxonomy = room.project && visibleProject ? {
      project: room.project,
      tags: room.tagLinks.map((link: any) => ({ ...link.tag, category: String(link.tag.category) })).filter((tag: any) => tag.projectId === room.project.id),
      catalog: tagCatalog.map((tag: any) => ({ ...tag, category: String(tag.category) })),
      canManage: room.createdByUserId === session.user.id && (visibleProject.role === "OWNER" || visibleProject.role === "EDITOR"),
      canManageVocabulary: visibleProject.role === "OWNER" || visibleProject.role === "EDITOR",
      updatedAt: room.updatedAt.toISOString(),
    } : null;
    const promotedMediaIds = room.recordingAssets.map((recording: any) => {
      const promotion = jsonObject(jsonObject(recording.localManifestJson).promotion);
      return cleanText(promotion.mediaAssetId);
    }).filter(Boolean);
    const handoffAttachments = visibleProject && promotedMediaIds.length ? await prisma.studioAssetAttachment.findMany({
      where: { projectId: visibleProject.id, assetId: { in: promotedMediaIds } },
      select: { id: true, projectId: true, assetId: true, role: true, source: true, updatedAt: true, asset: { select: { filename: true, mimeType: true, isProxy: true } } },
    }) : [];
    const attachmentByAssetId = new Map(handoffAttachments.map((attachment: any) => [attachment.assetId, attachment]));
    const studioHandoff = room.project && visibleProject ? {
      project: room.project,
      recordings: room.recordingAssets.map((recording: any) => {
        const promotion = jsonObject(jsonObject(recording.localManifestJson).promotion);
        const mediaAssetId = cleanText(promotion.mediaAssetId) || null;
        const promotedProjectId = cleanText(promotion.projectId) || null;
        const attachment = mediaAssetId ? attachmentByAssetId.get(mediaAssetId) as any : null;
        const status = !mediaAssetId
          ? recording.status === "VERIFIED" ? "READY_FOR_HANDOFF" : "NOT_READY"
          : promotedProjectId && promotedProjectId !== room.project.id
            ? "PROJECT_CONFLICT"
            : attachment ? "ATTACHED" : "RECEIPT_MISSING";
        return {
          recordingAssetId: recording.id,
          fileName: recording.fileName || "Unnamed recording",
          kind: String(recording.kind),
          recordingStatus: String(recording.status),
          status,
          mediaAssetId,
          attachmentId: attachment?.id ?? null,
          attachmentUpdatedAt: attachment?.updatedAt?.toISOString() ?? null,
          episodeSlug: cleanText(promotion.episodeSlug) || null,
          importRole: cleanText(promotion.importRole) || attachment?.role || null,
          promotedAt: cleanText(promotion.promotedAt) || null,
        };
      }),
    } : null;
    return <main className="min-h-full bg-transparent px-6 py-8 lg:px-10"><div className="mx-auto max-w-[1240px]"><nav aria-label="Session navigation" className="mb-6 text-sm font-bold text-[#765f40]"><Link href="/schedule" className="hover:underline">Calendar</Link><span aria-hidden="true"> / </span><span>Session workspace</span></nav><SessionReviewClient roomId={room.id} sessionTitle={room.title || "Capture session"} mode={workspaceMode} notesView={sessionNoteView} joinedFromInvitation={joinedFromInvitation} preparation={sessionPreparation} consentSnapshot={consentSnapshot} contentReadiness={contentReadiness} sourceEvidence={sourceEvidence} audibleEventSources={audibleEventSources} readinessTopology={sessionReadinessTopology} canReleaseHeldMedia={session.user.isStaff} sessionTaxonomy={sessionTaxonomy} studioHandoff={studioHandoff} sessionNotes={sessionNotes} canUseProjectTeamNotes={canViewProjectTeamNotes} sessionQuickEntries={sessionQuickEntries} captureReceipts={captureReceipts} sessionContinuity={sessionContinuity} collaborationContext={collaborationContext} /></div></main>;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[session-review] failed to load scoped session", error);
    return <main className="min-h-full px-6 py-10 lg:px-10"><section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8" role="status"><CircleAlert className="text-amber-700" aria-hidden="true" /><h1 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">Session review is unavailable.</h1><p className="mt-2 font-semibold text-[#765f40]">{safeDatabaseMessage(error)} No sample transcript, candidates, or tasks are being shown, and no saved work was changed.</p><Link href={`/sessions/${encodeURIComponent(roomId)}`} className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link></section></main>;
  }
}
