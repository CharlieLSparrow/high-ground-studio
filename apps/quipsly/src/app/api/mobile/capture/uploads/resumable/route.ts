// Canonical mobile-capture upload creation, recovery, and status surface.
// The implementation is shared with /api/ingest/mobile/resumable so old API
// clients can migrate without duplicating the security-critical state machine.
export const runtime = "nodejs";

export { GET, POST } from "../../../../ingest/mobile/resumable/route";
