import type { HgoEpisodePublishCandidatePacket } from "./publish-candidate-packet";
import type { HgoEpisodeProjection } from "./projection-types";
import type { HgoStagedProjectionArtifact } from "./staged-projection-artifact";

export const HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND =
  "hgo-episode-publish-draft-v1" as const;

export type HgoEpisodePublishDraftPacket = {
  packetKind: typeof HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND;
  createdAt: string;
  source: {
    recordId: string;
    artifactId: string;
    artifactHash: string;
    projectionId: string;
    sourceArtifactVersion: HgoStagedProjectionArtifact["artifactVersion"];
    sourceProjectionStatus: HgoEpisodeProjection["status"];
    sourceProjectionVisibility: HgoEpisodeProjection["visibility"];
  };
  episodePage: {
    title: string;
    subtitle: string;
    slug: string;
    proposedRoute: string;
    episodeNumber: string;
    audioState: HgoEpisodeProjection["audio"]["state"];
  };
  proposedFiles: {
    privateDraftPath: string;
    deferredPublicPath: string;
    routePath: string;
  };
  frontmatter: {
    title: string;
    subtitle: string;
    description: string;
    contentType: "episode";
    project: "high-ground-odyssey";
    series: "high-ground-odyssey";
    episodeNumber: string;
    access: "private-review";
    status: "draft";
    sourceArtifactId: string;
    sourceArtifactHash: string;
    citationReview: "not-certified";
    publicSafetyReview: "not-certified";
    scopes: HgoEpisodeProjection["scopes"];
  };
  mdxDraft: string;
  reviewState: {
    readinessState: HgoEpisodePublishCandidatePacket["readiness"]["state"];
    blockers: string[];
    warnings: string[];
    artifactValidationWarnings: string[];
    artifactValidationErrors: string[];
  };
  safety: {
    writesContentFiles: false;
    createsPublicRoute: false;
    publishesLivePage: false;
    mutatesDatabase: false;
    callsProviders: false;
    certifiesCitationReview: false;
    certifiesPublicSafety: false;
    mutatesStagedArtifact: false;
  };
};

export type HgoEpisodePublishDraftPacketValidationResult =
  | {
      ok: true;
      packet: HgoEpisodePublishDraftPacket;
      errors: [];
      warnings: string[];
    }
  | {
      ok: false;
      packet: null;
      errors: string[];
      warnings: string[];
    };

const falseSafetyFlags = [
  "writesContentFiles",
  "createsPublicRoute",
  "publishesLivePage",
  "mutatesDatabase",
  "callsProviders",
  "certifiesCitationReview",
  "certifiesPublicSafety",
  "mutatesStagedArtifact",
] as const satisfies readonly (keyof HgoEpisodePublishDraftPacket["safety"])[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
) {
  const value = record[key];

  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path}.${key} must be a non-empty string.`);
    return "";
  }

  return value;
}

function readStringArray(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings.`);
    return [];
  }

  const strings = value.filter((item): item is string => typeof item === "string");

  if (strings.length !== value.length) {
    errors.push(`${path} must contain only strings.`);
  }

  return strings;
}

function normalizeSlug(slug: string) {
  return (
    slug
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, "")
      .replace(/^episodes\//, "")
      .replace(/[^a-z0-9/-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/\/{2,}/g, "/")
      .replace(/^-+|-+$/g, "") || "pending-episode-slug"
  );
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

function yamlStringList(values: string[]) {
  if (!values.length) {
    return "[]";
  }

  return `\n${values.map((value) => `  - ${yamlScalar(value)}`).join("\n")}`;
}

function mdxList(values: string[]) {
  if (!values.length) {
    return "- None recorded.";
  }

  return values.map((value) => `- ${value}`).join("\n");
}

function createMdxDraft({
  frontmatter,
  projection,
}: {
  frontmatter: HgoEpisodePublishDraftPacket["frontmatter"];
  projection: HgoEpisodeProjection;
}) {
  const frontmatterText = [
    "---",
    `title: ${yamlScalar(frontmatter.title)}`,
    `subtitle: ${yamlScalar(frontmatter.subtitle)}`,
    `description: ${yamlScalar(frontmatter.description)}`,
    `contentType: ${yamlScalar(frontmatter.contentType)}`,
    `project: ${yamlScalar(frontmatter.project)}`,
    `series: ${yamlScalar(frontmatter.series)}`,
    `episodeNumber: ${yamlScalar(frontmatter.episodeNumber)}`,
    `access: ${yamlScalar(frontmatter.access)}`,
    `status: ${yamlScalar(frontmatter.status)}`,
    `sourceArtifactId: ${yamlScalar(frontmatter.sourceArtifactId)}`,
    `sourceArtifactHash: ${yamlScalar(frontmatter.sourceArtifactHash)}`,
    `citationReview: ${yamlScalar(frontmatter.citationReview)}`,
    `publicSafetyReview: ${yamlScalar(frontmatter.publicSafetyReview)}`,
    `scopes: ${yamlStringList(frontmatter.scopes)}`,
    "---",
  ].join("\n");

  const beats = projection.beats.map(
    (beat) =>
      `### ${beat.title}\n\n${beat.summary}\n\nScope: \`${beat.scope}\`${
        beat.timingHint ? `\n\nTiming: ${beat.timingHint}` : ""
      }`,
  );
  const voiceCards = projection.voiceCards.map(
    (card) => `- **${card.speaker}:** ${card.summary}`,
  );
  const pullQuotes = projection.pullQuotes.map(
    (quote) =>
      `- "${quote.text}" - ${quote.attribution} (\`${quote.citationState}\`)`,
  );
  const sourceNotes = projection.sourceNotes.map(
    (note) => `- **${note.label}:** ${note.detail} (\`${note.status}\`)`,
  );
  const backstageNotes = projection.backstageNotes.map(
    (note) => `- **${note.label}:** ${note.note}`,
  );

  return [
    frontmatterText,
    "",
    `# ${projection.title}`,
    "",
    projection.summary,
    "",
    "## Public Promise",
    "",
    projection.thesis,
    "",
    "## Episode Beats",
    "",
    beats.length ? beats.join("\n\n") : "No beats recorded.",
    "",
    "## Voice Cards",
    "",
    mdxList(voiceCards),
    "",
    "## Pull Quotes",
    "",
    mdxList(pullQuotes),
    "",
    "## Source Notes",
    "",
    mdxList(sourceNotes),
    "",
    "## Backstage Notes",
    "",
    mdxList(backstageNotes),
    "",
    "## Review Boundary",
    "",
    "This draft was generated from a private HGO staged artifact. Citation review and public-safety review are not certified by this packet.",
    "",
  ].join("\n");
}

export function createHgoEpisodePublishDraftPacket({
  artifact,
  candidate,
  createdAt = candidate.createdAt,
}: {
  artifact: HgoStagedProjectionArtifact;
  candidate: HgoEpisodePublishCandidatePacket;
  createdAt?: string;
}): HgoEpisodePublishDraftPacket {
  const projection = artifact.projection;
  const slug = normalizeSlug(candidate.episodePage.slug || projection.slug);
  const frontmatter: HgoEpisodePublishDraftPacket["frontmatter"] = {
    title: projection.title,
    subtitle: projection.subtitle,
    description: projection.summary,
    contentType: "episode",
    project: "high-ground-odyssey",
    series: "high-ground-odyssey",
    episodeNumber: projection.episodeNumber,
    access: "private-review",
    status: "draft",
    sourceArtifactId: artifact.artifactId,
    sourceArtifactHash: candidate.source.artifactHash,
    citationReview: "not-certified",
    publicSafetyReview: "not-certified",
    scopes: [...projection.scopes],
  };

  return {
    packetKind: HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND,
    createdAt,
    source: {
      recordId: candidate.source.recordId,
      artifactId: artifact.artifactId,
      artifactHash: candidate.source.artifactHash,
      projectionId: projection.id,
      sourceArtifactVersion: artifact.artifactVersion,
      sourceProjectionStatus: projection.status,
      sourceProjectionVisibility: projection.visibility,
    },
    episodePage: {
      title: projection.title,
      subtitle: projection.subtitle,
      slug,
      proposedRoute: `/episodes/${slug}`,
      episodeNumber: projection.episodeNumber,
      audioState: projection.audio.state,
    },
    proposedFiles: {
      privateDraftPath: `apps/web/content/_staging/hgo/${slug}.mdx`,
      deferredPublicPath: `apps/web/content/publish/${slug}.mdx`,
      routePath: `/episodes/${slug}`,
    },
    frontmatter,
    mdxDraft: createMdxDraft({ frontmatter, projection }),
    reviewState: {
      readinessState: candidate.readiness.state,
      blockers: [...candidate.readiness.blockers],
      warnings: [...candidate.readiness.warnings],
      artifactValidationWarnings: [...artifact.validationWarnings],
      artifactValidationErrors: [...artifact.validationErrors],
    },
    safety: {
      writesContentFiles: false,
      createsPublicRoute: false,
      publishesLivePage: false,
      mutatesDatabase: false,
      callsProviders: false,
      certifiesCitationReview: false,
      certifiesPublicSafety: false,
      mutatesStagedArtifact: false,
    },
  };
}

export function createHgoEpisodePublishDraftFileName(
  packet: HgoEpisodePublishDraftPacket,
) {
  return `${packet.episodePage.slug}.hgo-episode-publish-draft.json`;
}

export function createHgoEpisodePublishDraftMdxFileName(
  packet: HgoEpisodePublishDraftPacket,
) {
  return `${packet.episodePage.slug}.private-review.mdx`;
}

export function createHgoEpisodePublishDraftFrontmatterFileName(
  packet: HgoEpisodePublishDraftPacket,
) {
  return `${packet.episodePage.slug}.frontmatter.json`;
}

export function validateHgoEpisodePublishDraftPacket(
  input: unknown,
): HgoEpisodePublishDraftPacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      packet: null,
      errors: ["Publish draft packet must be a JSON object."],
      warnings,
    };
  }

  if (input.packetKind !== HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND) {
    errors.push(
      `packetKind must be ${HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND}.`,
    );
  }

  readString(input, "createdAt", "packet", errors);

  const source = isRecord(input.source) ? input.source : null;
  const episodePage = isRecord(input.episodePage) ? input.episodePage : null;
  const proposedFiles = isRecord(input.proposedFiles)
    ? input.proposedFiles
    : null;
  const frontmatter = isRecord(input.frontmatter) ? input.frontmatter : null;
  const reviewState = isRecord(input.reviewState) ? input.reviewState : null;
  const safety = isRecord(input.safety) ? input.safety : null;

  if (!source) {
    errors.push("source must be an object.");
  } else {
    readString(source, "recordId", "source", errors);
    readString(source, "artifactId", "source", errors);
    readString(source, "artifactHash", "source", errors);
    readString(source, "projectionId", "source", errors);
  }

  if (!episodePage) {
    errors.push("episodePage must be an object.");
  } else {
    readString(episodePage, "title", "episodePage", errors);
    readString(episodePage, "slug", "episodePage", errors);
    const proposedRoute = readString(
      episodePage,
      "proposedRoute",
      "episodePage",
      errors,
    );

    if (proposedRoute && !proposedRoute.startsWith("/episodes/")) {
      errors.push("episodePage.proposedRoute must stay under /episodes/.");
    }
  }

  if (!proposedFiles) {
    errors.push("proposedFiles must be an object.");
  } else {
    const privateDraftPath = readString(
      proposedFiles,
      "privateDraftPath",
      "proposedFiles",
      errors,
    );
    const deferredPublicPath = readString(
      proposedFiles,
      "deferredPublicPath",
      "proposedFiles",
      errors,
    );
    readString(proposedFiles, "routePath", "proposedFiles", errors);

    if (
      privateDraftPath &&
      !privateDraftPath.startsWith("apps/web/content/_staging/")
    ) {
      errors.push(
        "proposedFiles.privateDraftPath must stay under apps/web/content/_staging/.",
      );
    }

    if (
      deferredPublicPath &&
      !deferredPublicPath.startsWith("apps/web/content/publish/")
    ) {
      warnings.push(
        "proposedFiles.deferredPublicPath is not under apps/web/content/publish/.",
      );
    }
  }

  if (!frontmatter) {
    errors.push("frontmatter must be an object.");
  } else {
    readString(frontmatter, "title", "frontmatter", errors);
    readString(frontmatter, "description", "frontmatter", errors);
    readStringArray(frontmatter.scopes, "frontmatter.scopes", errors);

    if (frontmatter.access !== "private-review") {
      errors.push("frontmatter.access must be private-review.");
    }

    if (frontmatter.status !== "draft") {
      errors.push("frontmatter.status must be draft.");
    }

    if (frontmatter.citationReview !== "not-certified") {
      errors.push("frontmatter.citationReview must be not-certified.");
    }

    if (frontmatter.publicSafetyReview !== "not-certified") {
      errors.push("frontmatter.publicSafetyReview must be not-certified.");
    }
  }

  const mdxDraft =
    typeof input.mdxDraft === "string" && input.mdxDraft.trim()
      ? input.mdxDraft
      : "";

  if (!mdxDraft) {
    errors.push("mdxDraft must be a non-empty string.");
  } else {
    if (!mdxDraft.startsWith("---")) {
      warnings.push("mdxDraft does not start with frontmatter delimiters.");
    }

    if (!mdxDraft.includes("not certified")) {
      warnings.push("mdxDraft does not mention uncertified review state.");
    }
  }

  if (!reviewState) {
    errors.push("reviewState must be an object.");
  } else {
    readString(reviewState, "readinessState", "reviewState", errors);
    readStringArray(reviewState.blockers, "reviewState.blockers", errors);
    readStringArray(reviewState.warnings, "reviewState.warnings", errors);
    readStringArray(
      reviewState.artifactValidationWarnings,
      "reviewState.artifactValidationWarnings",
      errors,
    );
    readStringArray(
      reviewState.artifactValidationErrors,
      "reviewState.artifactValidationErrors",
      errors,
    );
  }

  if (!safety) {
    errors.push("safety must be an object.");
  } else {
    for (const flag of falseSafetyFlags) {
      if (safety[flag] !== false) {
        errors.push(`safety.${flag} must be false for private draft review.`);
      }
    }
  }

  if (errors.length) {
    return {
      ok: false,
      packet: null,
      errors,
      warnings,
    };
  }

  return {
    ok: true,
    packet: input as HgoEpisodePublishDraftPacket,
    errors: [],
    warnings,
  };
}

export function parseHgoEpisodePublishDraftPacketJson(
  json: string,
): HgoEpisodePublishDraftPacketValidationResult {
  try {
    return validateHgoEpisodePublishDraftPacket(JSON.parse(json) as unknown);
  } catch (error) {
    return {
      ok: false,
      packet: null,
      errors: [
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON.",
      ],
      warnings: [],
    };
  }
}
