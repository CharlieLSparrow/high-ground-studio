import "server-only";

import type { StudioProjectAccessRole } from "@prisma/client";

import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { verifyBearerToken } from "@/lib/server/firebase-auth";
import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";
import { getPrismaClient } from "@/lib/prisma";
import {
  RESEARCH_STUDIO_HANDOFF_KIND,
  RESEARCH_STUDIO_HANDOFF_SCHEMA,
} from "@/lib/server/research-studio-handoff";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

type NativeProjectContext = {
  id: string;
  slug: string;
  name: string;
  sourceLabel: string | null;
  role: StudioProjectAccessRole;
  updatedAt: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function buildNativeSessionContext(request: Request) {
  const actor = await verifyBearerToken(request);
  const prisma = getPrismaClient();
  const onboarding = await ensureQuipslyStarterStateForUser({
    userId: actor.id,
    email: actor.primaryEmail,
    prisma,
  });
  const projects = await listProjectsVisibleToEmail(actor.primaryEmail, prisma);
  const projectIds = projects.map((project) => project.id);
  const handoffRows = projectIds.length > 0
    ? await prisma.studioOutputPacket.findMany({
        where: {
          projectId: { in: projectIds },
          kind: RESEARCH_STUDIO_HANDOFF_KIND,
          status: { not: "archived" },
        },
        select: {
          id: true,
          title: true,
          status: true,
          packetJson: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, slug: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : [];
  const studioEvidenceHandoffs = handoffRows.flatMap((row) => {
    const packet = objectValue(row.packetJson);
    if (packet.schema !== RESEARCH_STUDIO_HANDOFF_SCHEMA) return [];
    const source = objectValue(packet.source);
    const annotation = objectValue(packet.annotation);
    const writing = objectValue(packet.writing);
    const tags = Array.isArray(annotation.tags)
      ? annotation.tags.map(objectValue).map((tag) => stringValue(tag.label)).filter(Boolean)
      : [];
    return [{
      id: row.id,
      title: row.title,
      status: row.status,
      projectId: row.project.id,
      projectSlug: row.project.slug,
      projectName: row.project.name,
      sourceTitle: stringValue(source.title),
      sourcePath: stringValue(source.sourcePath) || null,
      sourceFingerprint: stringValue(source.contentSha256),
      annotationId: stringValue(annotation.id),
      annotationRevision: numberValue(annotation.revision),
      annotationKind: stringValue(annotation.kind),
      annotationBody: stringValue(annotation.body),
      exactText: stringValue(annotation.exactText),
      tags: stringArray(tags),
      publicWritingUseCount: Array.isArray(writing.publicUses) ? writing.publicUses.length : 0,
      privateWritingUseCount: numberValue(writing.privateUseCount),
      humanReviewRequired: objectValue(packet.safety).humanReviewRequired === true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }];
  });
  const correctionRooms = await prisma.callRoom.findMany({
    where: actor.isStaff
      ? { transcriptCorrections: { some: {} } }
      : {
          transcriptCorrections: { some: {} },
          OR: [
            { createdByUserId: actor.id },
            { participants: { some: { userId: actor.id, accessStatus: "ACTIVE" } } },
            { booking: { clientUserId: actor.id } },
            { booking: { coachUserId: actor.id } },
          ],
        },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });
  const correctionDesks = await Promise.all(correctionRooms.map(async (room) => {
    try {
      const desk = await readTranscriptCorrectionDesk({
        prisma,
        roomId: room.id,
        actor: { id: actor.id, email: actor.primaryEmail, isStaff: actor.isStaff },
      });
      return { room, desk };
    } catch {
      // Native context is a read surface. One stale or newly-held room must not
      // break account verification, and its correction text must not leak as a
      // fallback. It is simply omitted until its canonical desk is readable.
      return null;
    }
  }));
  const studioTranscriptCorrections = correctionDesks.flatMap((entry) => {
    if (!entry?.desk.gate.allowed) return [];
    return entry.desk.segments.flatMap((segment: any) => {
      const corrections = [
        ...(segment.acceptedCorrection ? [segment.acceptedCorrection] : []),
        ...segment.proposals,
      ];
      return corrections.map((correction) => ({
        id: correction.id,
        roomId: entry.room.id,
        roomTitle: entry.room.title || "Capture session",
        transcriptJobId: entry.desk.transcriptJobId,
        segmentId: segment.id,
        origin: correction.origin,
        status: correction.status,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        providerSpeakerLabel: segment.providerSpeakerLabel,
        providerText: segment.providerText,
        correctedSpeakerLabel: correction.correctedSpeakerLabel,
        correctedText: correction.correctedText,
        effectiveSpeakerLabel: segment.speakerLabel,
        effectiveText: segment.text,
        reason: correction.reason,
        revisionCount: correction.revisions.length,
        playbackURL: entry.desk.playback?.url ?? null,
        playbackSourceId: entry.desk.playback?.sourceId ?? null,
        humanReviewRequired: correction.status === "proposed",
        updatedAt: correction.updatedAt,
      }));
    });
  });

  return {
    ok: true,
    authenticated: true,
    auth: {
      type: "firebase-bearer",
      sourceOfTruth: "Firebase proves identity; Quipsly owns app access and work state.",
    },
    user: {
      id: actor.id,
      email: actor.primaryEmail,
      primaryEmail: actor.primaryEmail,
      name: actor.name,
      roles: actor.roles,
      isStaff: actor.isStaff,
    },
    homeNest: onboarding.homeNest,
    onboarding: {
      freePlanSlug: onboarding.freePlanSlug,
      freeMembershipStatus: onboarding.freeMembershipStatus,
      freeMembershipCreated: onboarding.freeMembershipCreated,
      homeNestSlug: onboarding.homeNest.slug,
    },
    projects: projects.map((project): NativeProjectContext => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      sourceLabel: project.sourceLabel,
      role: project.role,
      updatedAt: project.updatedAt.toISOString(),
    })),
    studioEvidenceHandoffs,
    studioTranscriptCorrections,
    counts: {
      projects: projects.length,
      studioEvidenceHandoffs: studioEvidenceHandoffs.length,
      studioTranscriptCorrections: studioTranscriptCorrections.length,
    },
  };
}
