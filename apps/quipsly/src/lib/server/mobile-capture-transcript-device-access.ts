import "server-only";

function text(value: unknown, maximumLength = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

export function mobileCaptureTranscriptAccessibleAssetWhere(input: {
  recordingAssetId: string;
  userId: string;
  actorEmail: string;
  isStaff: boolean;
}) {
  if (input.isStaff) return { id: input.recordingAssetId };
  return {
    id: input.recordingAssetId,
    OR: [
      { room: { createdByUserId: input.userId } },
      {
        room: {
          participants: {
            some: { userId: input.userId, accessStatus: "ACTIVE" },
          },
        },
      },
      { room: { booking: { clientUserId: input.userId } } },
      { room: { booking: { coachUserId: input.userId } } },
      ...(input.actorEmail
        ? [{
            room: {
              project: {
                accessGrants: {
                  some: { email: input.actorEmail, status: "ACTIVE" },
                },
              },
            },
          }]
        : []),
    ],
  };
}

export function mobileCaptureTranscriptParticipantMismatch(input: {
  asset: any;
  userId: string;
  isStaff: boolean;
}) {
  return !input.isStaff
    && ["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(String(input.asset?.kind))
    && Boolean(text(input.asset?.participant?.userId, 240))
    && text(input.asset.participant.userId, 240) !== input.userId;
}
