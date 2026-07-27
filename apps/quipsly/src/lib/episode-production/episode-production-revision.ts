export type EpisodeProductionRevisionDecision =
  | {
      ok: true;
      expectedUpdatedAt: Date;
      actualUpdatedAt: string;
    }
  | {
      ok: false;
      code:
        | "episode-production-revision-required"
        | "episode-production-revision-stale";
      message: string;
      actualUpdatedAt: string;
    };

function parsedDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds)
    : null;
}

export function requireCurrentEpisodeProductionRevision(
  expectedValue: unknown,
  actualValue: Date | string,
): EpisodeProductionRevisionDecision {
  const actual = actualValue instanceof Date
    ? actualValue
    : parsedDate(actualValue);
  if (!actual) {
    throw new Error(
      "The persisted episode-production revision is invalid.",
    );
  }
  const actualUpdatedAt = actual.toISOString();
  const expectedUpdatedAt = parsedDate(expectedValue);
  if (!expectedUpdatedAt) {
    return {
      ok: false,
      code: "episode-production-revision-required",
      message:
        "Refresh this episode before approving or undoing alignment. The request did not include the exact production revision you reviewed.",
      actualUpdatedAt,
    };
  }
  if (
    expectedUpdatedAt.getTime()
      !== actual.getTime()
  ) {
    return {
      ok: false,
      code: "episode-production-revision-stale",
      message:
        "Episode production changed after this editor loaded. Refresh and review the current sources before approving or undoing alignment.",
      actualUpdatedAt,
    };
  }
  return {
    ok: true,
    expectedUpdatedAt,
    actualUpdatedAt,
  };
}
