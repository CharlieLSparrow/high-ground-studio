import "server-only";

export function canManageCoachingBookingHold(input: {
  actorUserId: string;
  actorIsStaff: boolean;
  assignedCoachUserId: string | null | undefined;
}) {
  return (
    input.actorIsStaff ||
    (Boolean(input.actorUserId) && input.assignedCoachUserId === input.actorUserId)
  );
}
