import type {
  HgoCitationState,
  HgoContentScope,
  HgoEpisodeProjection,
  HgoProjectionStatus,
  HgoProjectionVisibility,
  HgoSourceNoteStatus,
} from "./projection-types";

export type HgoProjectionValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const statusValues = new Set<HgoProjectionStatus>([
  "synthetic",
  "staged",
  "live",
  "archived",
]);

const visibilityValues = new Set<HgoProjectionVisibility>([
  "private",
  "staged",
  "public",
]);

const contentScopeValues = new Set<HgoContentScope>([
  "book-only",
  "episode-only",
  "book-and-episode",
  "internal",
]);

const citationStateValues = new Set<HgoCitationState>([
  "synthetic",
  "needs-source",
  "needs-review",
  "verified",
  "do-not-use",
]);

const sourceNoteStatusValues = new Set<HgoSourceNoteStatus>([
  "synthetic",
  "needs-review",
  "verified",
  "do-not-use",
]);

const liveBlockingCitationStates = new Set<HgoCitationState>([
  "needs-source",
  "needs-review",
  "do-not-use",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringField(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
) {
  if (!isNonEmptyString(value[field])) {
    errors.push(`Missing required string field: ${field}.`);
  }
}

function validateObjectField(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
) {
  if (!isRecord(value[field])) {
    errors.push(`Missing required object field: ${field}.`);
    return null;
  }

  return value[field];
}

function validateArrayField(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
) {
  if (!Array.isArray(value[field])) {
    errors.push(`Missing required array field: ${field}.`);
    return [];
  }

  return value[field];
}

function validateProjectionShape(value: Record<string, unknown>, errors: string[]) {
  for (const field of [
    "id",
    "slug",
    "episodeNumber",
    "title",
    "subtitle",
    "summary",
    "thesis",
    "lifecycleNote",
  ]) {
    validateStringField(value, field, errors);
  }

  if (!statusValues.has(value.status as HgoProjectionStatus)) {
    errors.push("Invalid projection status.");
  }

  if (!visibilityValues.has(value.visibility as HgoProjectionVisibility)) {
    errors.push("Invalid projection visibility.");
  }

  const hero = validateObjectField(value, "hero", errors);

  if (hero) {
    validateStringField(hero, "eyebrow", errors);
    validateStringField(hero, "visualPrompt", errors);
    validateStringField(hero, "colorMood", errors);
  }

  const audio = validateObjectField(value, "audio", errors);

  if (audio) {
    validateStringField(audio, "state", errors);
    validateStringField(audio, "placeholderLabel", errors);
  }

  for (const scope of validateArrayField(value, "scopes", errors)) {
    if (!contentScopeValues.has(scope as HgoContentScope)) {
      errors.push(`Invalid content scope: ${String(scope)}.`);
    }
  }

  for (const [index, beat] of validateArrayField(value, "beats", errors).entries()) {
    if (!isRecord(beat)) {
      errors.push(`Beat ${index + 1} must be an object.`);
      continue;
    }

    validateStringField(beat, "title", errors);
    validateStringField(beat, "summary", errors);

    if (!contentScopeValues.has(beat.scope as HgoContentScope)) {
      errors.push(`Beat ${index + 1} has an invalid scope.`);
    }
  }

  for (const [index, card] of validateArrayField(value, "voiceCards", errors).entries()) {
    if (!isRecord(card)) {
      errors.push(`Voice card ${index + 1} must be an object.`);
      continue;
    }

    if (card.speaker !== "Charlie" && card.speaker !== "Homer") {
      errors.push(`Voice card ${index + 1} has an invalid speaker.`);
    }

    validateStringField(card, "summary", errors);
  }

  for (const [index, quote] of validateArrayField(value, "pullQuotes", errors).entries()) {
    if (!isRecord(quote)) {
      errors.push(`Pull quote ${index + 1} must be an object.`);
      continue;
    }

    validateStringField(quote, "text", errors);
    validateStringField(quote, "attribution", errors);

    if (!citationStateValues.has(quote.citationState as HgoCitationState)) {
      errors.push(`Pull quote ${index + 1} has an invalid citation state.`);
    }
  }

  for (const [index, source] of validateArrayField(value, "sourceNotes", errors).entries()) {
    if (!isRecord(source)) {
      errors.push(`Source note ${index + 1} must be an object.`);
      continue;
    }

    validateStringField(source, "label", errors);
    validateStringField(source, "detail", errors);

    if (!sourceNoteStatusValues.has(source.status as HgoSourceNoteStatus)) {
      errors.push(`Source note ${index + 1} has an invalid status.`);
    }
  }

  validateArrayField(value, "backstageNotes", errors);
}

function collectWarnings(
  projection: HgoEpisodeProjection,
  warnings: string[],
) {
  if (projection.status === "live") {
    warnings.push("Imported projection status is live. Use staged review before public promotion.");
  }

  if (projection.visibility === "public") {
    warnings.push("Imported projection visibility is public. This import route does not publish.");
  }

  const unresolvedQuotes = projection.pullQuotes.filter((quote) =>
    liveBlockingCitationStates.has(quote.citationState),
  );
  const blockedSourceNotes = projection.sourceNotes.filter(
    (note) => note.status === "needs-review" || note.status === "do-not-use",
  );

  if (unresolvedQuotes.length) {
    warnings.push(
      `${unresolvedQuotes.length.toLocaleString()} pull quote${
        unresolvedQuotes.length === 1 ? "" : "s"
      } would block live publishing because citation state is unresolved.`,
    );
  }

  if (blockedSourceNotes.length) {
    warnings.push(
      `${blockedSourceNotes.length.toLocaleString()} source note${
        blockedSourceNotes.length === 1 ? "" : "s"
      } need review or removal before live publishing.`,
    );
  }
}

export function validateHgoEpisodeProjection(
  value: unknown,
): HgoProjectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Projection JSON must be an object."],
      warnings,
    };
  }

  validateProjectionShape(value, errors);

  if (!errors.length) {
    collectWarnings(value as HgoEpisodeProjection, warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
