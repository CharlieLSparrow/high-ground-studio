export type BrowserRetainedStartFailure = {
  category:
    | "permission"
    | "device-unavailable"
    | "unsupported-source"
    | "recording-system";
  message: string;
  technicalDetail: string;
};

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  constraint?: unknown;
};

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const candidate = error as ErrorLike;
  const name = typeof candidate.name === "string" && candidate.name.trim()
    ? candidate.name.trim()
    : "Error";
  const message = typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message.trim()
    : "No browser error message was provided.";
  const constraint = typeof candidate.constraint === "string" && candidate.constraint.trim()
    ? ` (constraint: ${candidate.constraint.trim()})`
    : "";
  return `${name}: ${message}${constraint}`;
}

/**
 * Converts browser and device failures into ordinary recovery language while
 * preserving the exact diagnostic for the collapsed support surface.
 *
 * A retained-source failure never claims that the independent live call ended.
 */
export function browserRetainedStartFailure(
  error: unknown,
  sourceType: "audio" | "video",
): BrowserRetainedStartFailure {
  const candidate = error && typeof error === "object" ? error as ErrorLike : null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const source = sourceType === "video" ? "camera or microphone" : "microphone";
  const technicalDetail = errorText(error);

  if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(name)) {
    return {
      category: "permission",
      message: `Recording access is off. Allow the ${source} for this site, then press Record again. Your call is still connected.`,
      technicalDetail,
    };
  }

  if (["NotReadableError", "AbortError", "TrackStartError", "DevicesNotFoundError", "NotFoundError"].includes(name)) {
    return {
      category: "device-unavailable",
      message: `The selected ${source} is busy, disconnected, or unavailable. Close the other app or choose another device, then press Record again. Your call is still connected.`,
      technicalDetail,
    };
  }

  if (["OverconstrainedError", "ConstraintNotSatisfiedError", "TypeError", "NotSupportedError"].includes(name)) {
    return {
      category: "unsupported-source",
      message: `The selected ${source} could not provide this recording format. Choose another device in Recording settings, then press Record again. Your call is still connected.`,
      technicalDetail,
    };
  }

  return {
    category: "recording-system",
    message: "The high-quality recording couldn’t start. Your call is still connected; check Recording settings and try again.",
    technicalDetail,
  };
}
