/**
 * Canonical identity for the current Session packet projection.
 *
 * Keep this contract dependency-free so operational scripts can validate and
 * seed packet fixtures without loading the packet builder's runtime graph.
 */
export const SESSION_PACKET_TEMPLATE_VERSION = "quipsly-session-packet-v4" as const;
