export const MOBILE_CAPTURE_RECENT_DEVICE_CONSENT_BASIS = "recent-device-consent";

export function mobileCaptureRequiresFreshRoomAuthorization(
  sourceProfile: unknown,
) {
  if (!sourceProfile || typeof sourceProfile !== "object" || Array.isArray(sourceProfile)) {
    return false;
  }
  return (sourceProfile as Record<string, unknown>).captureAuthorityBasis
    === MOBILE_CAPTURE_RECENT_DEVICE_CONSENT_BASIS;
}
