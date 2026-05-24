export const CONTENT_STUDIO_PRODUCTION_PACKET_KIND =
  "high-ground-content-studio-production-packet";

export type HgoProjectionImportInputResult =
  | {
      ok: true;
      projectionInput: unknown;
      warnings: string[];
      source: "direct-projection" | "content-studio-production-packet";
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
      source: "content-studio-production-packet";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContentStudioProductionPacket(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isRecord(value) && value.kind === CONTENT_STUDIO_PRODUCTION_PACKET_KIND
  );
}

export function extractHgoProjectionInputFromContentStudioPacket(
  value: unknown,
): HgoProjectionImportInputResult {
  if (!isContentStudioProductionPacket(value)) {
    return {
      ok: true,
      projectionInput: value,
      warnings: [],
      source: "direct-projection",
    };
  }

  const errors: string[] = [];
  const warnings = [
    "Imported a Content Studio production packet; extracted hgoProjectionDraft for staged review.",
  ];

  if (value.schemaVersion !== 1) {
    errors.push("Content Studio production packet schemaVersion must be 1.");
  }

  if (!isRecord(value.safety)) {
    errors.push("Content Studio production packet safety flags are missing.");
  } else {
    if (value.safety.providerCalls !== false) {
      errors.push(
        "Content Studio production packet cannot be imported after provider calls.",
      );
    }

    if (value.safety.publicPublished !== false) {
      errors.push(
        "Content Studio production packet cannot be imported after public publishing.",
      );
    }

    if (value.safety.containsRealManuscriptText !== false) {
      errors.push(
        "Content Studio production packet cannot claim to contain real manuscript text.",
      );
    }

    if (value.safety.requiresHumanReview !== true) {
      errors.push(
        "Content Studio production packet must still require human review.",
      );
    }
  }

  if (!isRecord(value.hgoProjectionDraft)) {
    errors.push(
      "Content Studio production packet does not include an HGO projection draft.",
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
      source: "content-studio-production-packet",
    };
  }

  return {
    ok: true,
    projectionInput: value.hgoProjectionDraft,
    warnings,
    source: "content-studio-production-packet",
  };
}
