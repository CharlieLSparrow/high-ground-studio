import Link from "next/link";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { notFound, unstable_rethrow } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA } from "@/lib/server/mobile-capture-quick-entry";
import { recordingContentReadiness } from "@/lib/server/mobile-capture-content-readiness";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { SessionReviewClient } from "./session-review-client";

export const dynamic = "force-dynamic";

function accessibleRoomWhere(userId: string, email: string, isStaff: boolean, roomId: string) {
  return isStaff ? { id: roomId } : {
    id: roomId,
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
      ...(email ? [{ project: { accessGrants: { some: { email, status: "ACTIVE" } } } }] : []),
    ],
  };
}

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

export default async function SessionReviewPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const session = await getQuipslySession();
  if (!session?.user) {
    return <main className="min-h-full px-6 py-10 lg:px-10"><section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8" role="status"><LockKeyhole className="text-amber-700" aria-hidden="true" /><h1 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">This session review is private.</h1><p className="mt-2 font-semibold text-[#765f40]">Sign in before reading consent, transcript evidence, candidates, or committed tasks.</p><Link href={`/login?callbackUrl=${encodeURIComponent(`/sessions/${roomId}`)}`} className="mt-5 inline-flex rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link></section></main>;
  }

  try {
    const prisma = getPrismaClient() as any;
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const room = await prisma.callRoom.findFirst({
      where: accessibleRoomWhere(session.user.id, actorEmail, session.user.isStaff, roomId),
      select: {
        id: true,
        purpose: true,
        createdByUserId: true,
        updatedAt: true,
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, category: true, projectId: true } } } },
        recordingAssets: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, kind: true, status: true, durationSeconds: true, localManifestJson: true, segmentsJson: true },
        },
        recordingConsents: {
          select: { status: true, canTranscribe: true },
        },
        stateReceipts: {
          where: { captureId: { not: null } },
          orderBy: { sequence: "asc" },
          select: { captureId: true, action: true, outcome: true, stateApplied: true, occurredAt: true, receivedAt: true },
        },
      },
    });
    if (!room) notFound();

    const consentSnapshot = {
      total: room.recordingConsents.length,
      granted: room.recordingConsents.filter((consent: any) => consent.status === "GRANTED").length,
      transcriptionPermitted: room.recordingConsents.filter((consent: any) => consent.status === "GRANTED" && consent.canTranscribe).length,
    };
    const contentReadiness = recordingContentReadiness(room.recordingAssets, room.purpose);
    const captureReceiptGroups = new Map<string, {
      captureId: string;
      startedAt: string | null;
      stoppedAt: string | null;
      lastReceivedAt: string;
    }>();
    for (const receipt of room.stateReceipts) {
      if (!receipt.captureId || receipt.outcome !== "APPLIED" || !receipt.stateApplied) continue;
      const captureId = String(receipt.captureId).toLowerCase();
      const current = captureReceiptGroups.get(captureId) ?? {
        captureId,
        startedAt: null,
        stoppedAt: null,
        lastReceivedAt: receipt.receivedAt.toISOString(),
      };
      if (receipt.action === "START_RECORDING") current.startedAt = receipt.occurredAt.toISOString();
      if (receipt.action === "STOP_RECORDING") current.stoppedAt = receipt.occurredAt.toISOString();
      current.lastReceivedAt = receipt.receivedAt.toISOString();
      captureReceiptGroups.set(captureId, current);
    }
    const captureReceipts = {
      captures: Array.from(captureReceiptGroups.values())
        .map((capture) => ({
          ...capture,
          status: capture.startedAt && capture.stoppedAt
            ? "START_AND_STOP_RECEIVED" as const
            : capture.startedAt
              ? "START_ONLY" as const
              : "STOP_ONLY" as const,
        }))
        .sort((left, right) => right.lastReceivedAt.localeCompare(left.lastReceivedAt)),
    };
    const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
    const visibleProject = room.project ? visibleProjects.find((project) => project.id === room.project.id) : null;
    const tagCatalog = visibleProject ? await prisma.studioTag.findMany({
      where: { projectId: visibleProject.id, isActive: true },
      orderBy: [{ category: "asc" }, { label: "asc" }],
      select: { id: true, label: true, slug: true, category: true, projectId: true },
    }) : [];
    const [quickNoteRows, quickTaskRows, quickGoalRows] = await Promise.all([
      prisma.coachingNote.findMany({
        where: { roomId: room.id, authorUserId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, title: true, body: true, sourceJson: true, createdAt: true,
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
        },
      }),
      prisma.actionItem.findMany({
        where: { roomId: room.id, assignedUserId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, title: true, detail: true, status: true, sourceJson: true, createdAt: true,
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
        },
      }),
      prisma.goal.findMany({
        where: { roomId: room.id, ownerUserId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, title: true, description: true, status: true, sourceJson: true, createdAt: true,
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
        },
      }),
    ]);
    const isQuickEntry = (value: unknown) => jsonObject(value).schema === MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA;
    const quickEntryTags = (row: any) => (row.tagLinks || [])
      .map((link: any) => link.tag)
      .filter((tag: any) => tag.isActive && visibleProject && tag.projectId === visibleProject.id)
      .map(({ id, label, slug }: any) => ({ id, label, slug }));
    const sessionQuickEntries = [
      ...quickNoteRows.filter((row: any) => isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "NOTE" as const, title: row.title, body: row.body, status: "CAPTURED", createdAt: row.createdAt.toISOString(), tags: quickEntryTags(row) })),
      ...quickTaskRows.filter((row: any) => isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "TASK" as const, title: row.title, body: row.detail, status: String(row.status), createdAt: row.createdAt.toISOString(), tags: quickEntryTags(row) })),
      ...quickGoalRows.filter((row: any) => isQuickEntry(row.sourceJson)).map((row: any) => ({ id: row.id, kind: "GOAL" as const, title: row.title, body: row.description, status: String(row.status), createdAt: row.createdAt.toISOString(), tags: quickEntryTags(row) })),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const sessionTaxonomy = room.project && visibleProject ? {
      project: room.project,
      tags: room.tagLinks.map((link: any) => ({ ...link.tag, category: String(link.tag.category) })).filter((tag: any) => tag.projectId === room.project.id),
      catalog: tagCatalog.map((tag: any) => ({ ...tag, category: String(tag.category) })),
      canManage: room.createdByUserId === session.user.id && (visibleProject.role === "OWNER" || visibleProject.role === "EDITOR"),
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
    return <main className="min-h-full bg-transparent px-6 py-8 lg:px-10"><div className="mx-auto max-w-[1240px]"><nav aria-label="Session navigation" className="mb-6 text-sm font-bold text-[#765f40]"><Link href="/schedule" className="hover:underline">Schedule</Link><span aria-hidden="true"> / </span><span>Session review</span></nav><SessionReviewClient roomId={room.id} consentSnapshot={consentSnapshot} contentReadiness={contentReadiness} sessionTaxonomy={sessionTaxonomy} studioHandoff={studioHandoff} sessionQuickEntries={sessionQuickEntries} captureReceipts={captureReceipts} /></div></main>;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[session-review] failed to load scoped session", error);
    return <main className="min-h-full px-6 py-10 lg:px-10"><section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8" role="status"><CircleAlert className="text-amber-700" aria-hidden="true" /><h1 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">Session review is unavailable.</h1><p className="mt-2 font-semibold text-[#765f40]">{safeDatabaseMessage(error)} No sample transcript, candidates, or tasks are being shown, and no saved work was changed.</p><Link href={`/sessions/${encodeURIComponent(roomId)}`} className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link></section></main>;
  }
}
