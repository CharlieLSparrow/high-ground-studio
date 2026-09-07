/** Booking holds reserve time. Only the self-scheduling flow represents a
 * client request; coach-created reservations must not impersonate the client.
 */
export function coachingHoldDetails(hold: {
  metadataJson?: unknown;
  offering?: { title?: string | null } | null;
}) {
  const metadata = hold.metadataJson && typeof hold.metadataJson === "object" && !Array.isArray(hold.metadataJson)
    ? hold.metadataJson as Record<string, unknown> : {};
  const title = typeof metadata.title === "string" ? metadata.title.trim() : "";
  return {
    isClientRequest: metadata.source === "quipsly-client-self-scheduling",
    title: title || hold.offering?.title?.trim() || null,
  };
}
