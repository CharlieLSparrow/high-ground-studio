import { buildQuipslyCoachingPracticeCommand } from "@high-ground/quipsly-domain/coaching-practice-command";

type PrismaLike = {
  coachProfile: { findFirst(args: unknown): Promise<any> };
  coachingBooking: { findMany(args: unknown): Promise<any[]> };
  bookingHold: { findMany(args: unknown): Promise<any[]> };
  callRoom: { findMany(args: unknown): Promise<any[]> };
};

function label(
  person:
    | { name?: string | null; primaryEmail?: string | null }
    | null
    | undefined,
) {
  return person?.name?.trim() || person?.primaryEmail?.trim() || null;
}

function transcriptPacketSummary(
  note: { sourceJson?: unknown } | null | undefined,
) {
  if (
    !note?.sourceJson ||
    typeof note.sourceJson !== "object" ||
    Array.isArray(note.sourceJson)
  ) {
    return false;
  }
  const source = (note.sourceJson as Record<string, unknown>).source;
  return (
    typeof source === "string" &&
    source.startsWith("transcript-coaching-packet")
  );
}

function providerState(command: { status?: string | null } | null | undefined) {
  switch (command?.status) {
    case "HELD":
      return "held";
    case "FAILED":
    case "RECONCILE_REQUIRED":
      return "needs-review";
    default:
      return null;
  }
}

/**
 * Loads only the evidence needed for a coach's first useful screen. This is
 * intentionally separate from the complete scheduling runway: it is exact-
 * coach scoped, bounded, read-only, and contains no provider readiness or
 * administrative inventory.
 */
export async function loadCoachingPracticeCommandForActor({
  prisma,
  userId,
  now = new Date(),
}: {
  prisma: PrismaLike;
  userId: string;
  now?: Date;
}) {
  const profile = await prisma.coachProfile.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  });
  if (!profile) return null;

  const recentBoundary = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1_000);
  const lateBoundary = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const [bookings, timeRequests, rooms] = await Promise.all([
    prisma.coachingBooking.findMany({
      where: {
        coachUserId: userId,
        scheduledEnd: { gte: lateBoundary },
        status: { in: ["REQUESTED", "CONFIRMED"] },
      },
      orderBy: { scheduledStart: "asc" },
      take: 40,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        engagementId: true,
        clientUser: { select: { name: true, primaryEmail: true } },
        offering: { select: { title: true } },
        sessionPreparation: {
          select: { clientSubmittedAt: true, coachPreparedAt: true },
        },
        callRoom: {
          select: {
            id: true,
            title: true,
            status: true,
            coachingEngagementId: true,
          },
        },
      },
    }),
    prisma.bookingHold.findMany({
      where: {
        coachProfileId: profile.id,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      orderBy: { scheduledStart: "asc" },
      take: 30,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        scheduledStart: true,
        scheduledEnd: true,
        contactEmail: true,
        clientUser: { select: { name: true, primaryEmail: true } },
        offering: { select: { title: true } },
      },
    }),
    prisma.callRoom.findMany({
      where: {
        purpose: "COACHING",
        updatedAt: { gte: recentBoundary },
        booking: { coachUserId: userId },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        bookingId: true,
        coachingEngagementId: true,
        title: true,
        status: true,
        scheduledStart: true,
        endedAt: true,
        booking: {
          select: {
            engagementId: true,
            clientUser: { select: { name: true, primaryEmail: true } },
          },
        },
        recordingAssets: {
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, status: true },
        },
        providerRecordingCommands: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
        transcriptJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
        notes: {
          where: { kind: "SUMMARY" },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { sourceJson: true },
        },
        outputs: {
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: { status: true },
        },
      },
    }),
  ]);

  return buildQuipslyCoachingPracticeCommand({
    now: now.toISOString(),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      title:
        booking.callRoom?.title ||
        booking.offering?.title ||
        "Coaching Session",
      status: booking.status,
      scheduledStart: booking.scheduledStart.toISOString(),
      scheduledEnd: booking.scheduledEnd?.toISOString() || null,
      roomId: booking.callRoom?.id || null,
      roomStatus: booking.callRoom?.status || null,
      engagementId:
        booking.engagementId || booking.callRoom?.coachingEngagementId || null,
      clientLabel: label(booking.clientUser),
      clientCheckInSubmittedAt:
        booking.sessionPreparation?.clientSubmittedAt?.toISOString() || null,
      coachPreparedAt:
        booking.sessionPreparation?.coachPreparedAt?.toISOString() || null,
    })),
    timeRequests: timeRequests.map((request) => ({
      id: request.id,
      status: request.status,
      expiresAt: request.expiresAt.toISOString(),
      scheduledStart: request.scheduledStart.toISOString(),
      scheduledEnd: request.scheduledEnd?.toISOString() || null,
      title: request.offering?.title || null,
      clientLabel: label(request.clientUser) || request.contactEmail || null,
    })),
    rooms: rooms.map((room) => {
      const latestRecording = room.recordingAssets?.[0] || null;
      const latestTranscript = room.transcriptJobs?.[0] || null;
      const hasPacket = room.notes?.some(transcriptPacketSummary) || false;
      const released =
        room.outputs?.some(
          (output: { status?: string | null }) => output.status === "RELEASED",
        ) || false;
      const draftOutput =
        room.outputs?.some(
          (output: { status?: string | null }) => output.status === "DRAFT",
        ) || false;
      return {
        id: room.id,
        bookingId: room.bookingId || null,
        engagementId:
          room.coachingEngagementId || room.booking?.engagementId || null,
        title: room.title || "Coaching Session",
        status: room.status,
        scheduledStart: room.scheduledStart?.toISOString() || null,
        endedAt: room.endedAt?.toISOString() || null,
        clientLabel: label(room.booking?.clientUser),
        recordingCount: room.recordingAssets?.length || 0,
        recordingStatus: latestRecording?.status || null,
        providerRecordingState: providerState(
          room.providerRecordingCommands?.[0],
        ),
        transcriptStatus: latestTranscript?.status || null,
        packetStatus:
          hasPacket || draftOutput ? "READY_FOR_REVIEW" : "NOT_STARTED",
        followUpReleased: released,
      };
    }),
  });
}
