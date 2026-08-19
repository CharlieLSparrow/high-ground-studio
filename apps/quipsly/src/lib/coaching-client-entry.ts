export type CoachingClientEntryPaths = {
  clientEntryPath: string | null;
  engagementPath: string | null;
  liveSessionPath: string | null;
  sessionWorkspacePath: string | null;
};

function pathId(value: string | null | undefined) {
  const id = String(value || "").trim();
  return id ? encodeURIComponent(id) : null;
}
/**
 * Navigational handoff for an already-authorized coaching participant.
 *
 * These paths are deliberately not bearer capabilities. Coaching booking and
 * participant records bind access to the verified Quipsly/Firebase identity;
 * the URL only gets that person to the right private surface.
 */
export function coachingClientEntryPaths(input: {
  roomId?: string | null;
  engagementId?: string | null;
}): CoachingClientEntryPaths {
  const roomId = pathId(input.roomId);
  const engagementId = pathId(input.engagementId);
  const liveSessionPath = roomId ? `/sessions/${roomId}?mode=live` : null;
  const sessionWorkspacePath = roomId ? `/sessions/${roomId}` : null;
  const engagementPath = engagementId
    ? `/coaching/engagements/${engagementId}`
    : null;

  return {
    clientEntryPath: liveSessionPath || engagementPath,
    engagementPath,
    liveSessionPath,
    sessionWorkspacePath,
  };
}
