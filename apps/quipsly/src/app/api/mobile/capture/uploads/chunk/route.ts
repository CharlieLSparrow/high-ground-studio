// Legacy chunk compatibility surface. New native builds use
// /api/mobile/capture/uploads/resumable so media bytes go directly to GCS.
export { POST } from "../../../../ingest/mobile/chunk/route";
