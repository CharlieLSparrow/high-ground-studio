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
