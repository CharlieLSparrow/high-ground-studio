import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createSourceAnnotation,
  createWritingDraftFromSourceAnnotation,
  setSourceAnnotationStatus,
} from "../apps/quipsly/src/lib/server/source-annotations.ts";
import { lookupStudioProjectDocument } from "../apps/quipsly/src/lib/studio/project-registry.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const ACTOR_EMAIL = "dev@quipsly.com";
const WORKSPACE_SLUG = "quipsly-local-dogfood";
const PROJECT_SLUG = "quipsly-local-dogfood";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertLocalDatabase(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to dogfood against non-local database host ${url.hostname}.`);
  }
}

async function loadFixture(definition) {
  const immutableText = await readFile(new URL(`../${definition.path}`, import.meta.url), "utf8");
  const fingerprint = sha256(immutableText);
  const startOffset = immutableText.indexOf(definition.quote);
  if (startOffset < 0) {
    throw new Error(`Dogfood quote is no longer present in ${definition.path}.`);
  }
  return {
    ...definition,
    immutableText,
    fingerprint,
    startOffset,
    endOffset: startOffset + definition.quote.length,
    versionedSlug: `${definition.slug}-${fingerprint.slice(0, 12)}`,
  };
}

async function ensureSource(prisma, projectId, fixture) {
  const existing = await prisma.studioSourceUnit.findUnique({
    where: {
      projectId_slug: {
        projectId,
        slug: fixture.versionedSlug,
      },
    },
  });
  if (existing) {
    if (existing.immutableText !== fixture.immutableText) {
      throw new Error(`Immutable source collision for ${fixture.versionedSlug}.`);
    }
    return existing;
  }
  return prisma.studioSourceUnit.create({
    data: {
      projectId,
      slug: fixture.versionedSlug,
      kind: "repository-document",
      title: fixture.title,
      sourcePath: fixture.path,
      author: "High Ground / Quipsly",
      immutableText: fixture.immutableText,
      metadataJson: {
        kind: "quipsly-local-research-dogfood-v1",
        repositoryRoot: REPO_ROOT,
        repositoryPath: fixture.path,
        contentSha256: fixture.fingerprint,
        sourceMutated: false,
        localOnly: true,
      },
      createdByEmail: ACTOR_EMAIL,
    },
  });
}

function requireOk(result, operation) {
  if (!result.ok) {
    throw new Error(`${operation} failed (${result.code}): ${result.message}`);
  }
  return result;
}

async function exerciseReviewLifecycle(prisma, annotationId, actorUserId) {
  const revisionCount = await prisma.studioSourceAnnotationRevision.count({
    where: { annotationId },
  });
  if (revisionCount !== 1) return false;

  const annotation = await prisma.studioSourceAnnotation.findUniqueOrThrow({
    where: { id: annotationId },
    select: { status: true, updatedAt: true },
  });
  const resolved = requireOk(await setSourceAnnotationStatus(prisma, {
    annotationId,
    actorUserId,
    expectedUpdatedAt: annotation.updatedAt,
    nextStatus: "resolved",
  }), "resolve annotation");
  requireOk(await setSourceAnnotationStatus(prisma, {
    annotationId,
    actorUserId,
    expectedUpdatedAt: new Date(resolved.updatedAt),
    nextStatus: "active",
  }), "reopen annotation");
  return true;
}

async function main() {
  assertLocalDatabase(DATABASE_URL);
  if (!APPLY) {
    console.log(JSON.stringify({
      ready: true,
      applyRequired: true,
      localOnly: true,
      fixtures: 4,
    }, null, 2));
    return;
  }

  const fixtures = await Promise.all([
    loadFixture({
      slug: "homer-coaching-workflow-guide",
      title: "Homer coaching workflow guide",
      path: "docs/quipsly/homer-coaching-workflow-guide.md",
      quote: "If one of those answers is unclear, that is product feedback, not Homer failure.",
      annotationKind: "question",
      annotationBody: "Turn every unclear runway state into a visible product repair and an owner, instead of asking Homer to remember a workaround.",
      tag: { slug: "coaching-follow-up", label: "Coaching follow-up", category: "review" },
    }),
    loadFixture({
      slug: "episode-4-audio-publication-goal",
      title: "Episode 4 audio-first publication goal",
      path: "docs/quipsly/episode-4-audio-publication-goal.md",
      quote: "Machine checks can prove safety and surface risks; they cannot certify cadence, humor, warmth, or whether the episode feels human.",
      annotationKind: "claim",
      annotationBody: "Make the human listen decision a first-class Episode 4 gate with the exact proof window and current approval state beside it.",
      tag: { slug: "episode-production", label: "Episode production", category: "production_breakdown" },
    }),
    loadFixture({
      slug: "coaching-capture-production-spine",
      title: "Quipsly coaching and capture production spine",
      path: "docs/quipsly/coaching-capture-production-spine.md",
      quote: "Do not flip `QUIPSLY_ALLOW_LIVE_STRIPE=true`, publish a payment link for a real client, or create external calendar events without explicit approval for that exact action.",
      annotationKind: "action",
      annotationBody: "Keep charging, client payment links, and external calendar writes behind distinct approval receipts so a coaching workflow cannot smuggle one side effect through another.",
      tag: { slug: "coaching-safety", label: "Coaching safety", category: "review" },
    }),
    loadFixture({
      slug: "episode-4-charlie-transcript-sanity",
      title: "Episode 4 Charlie transcript sanity check",
      path: "apps/QuipslyStudio/reports/episode-4-charlie-transcript-sanity-summary.md",
      quote: "`Charlie Ep4.wav` appears to be an edited Logic-style export rather than a raw continuous capture spine. That means transcript anchors are safer than envelope correlation, and some raw setup material may not appear in the spine at all.",
      annotationKind: "correction",
      annotationBody: "Carry the transcript-anchored v3 baseline into Studio as the current review truth and keep IMG_3746 held until raw-spine or manual evidence resolves it.",
      tag: { slug: "episode-sync", label: "Episode sync", category: "production_breakdown" },
    }),
  ]);

  const prisma = new PrismaClient({
    adapter: new PrismaPg(DATABASE_URL),
    log: ["error"],
  });

  try {
    const actor = await prisma.user.upsert({
      where: { primaryEmail: ACTOR_EMAIL },
      update: {},
      create: {
        primaryEmail: ACTOR_EMAIL,
        name: "Quipsly local dogfood operator",
        emailVerified: new Date(),
      },
    });
    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: WORKSPACE_SLUG },
      update: {},
      create: {
        slug: WORKSPACE_SLUG,
        name: "Quipsly local dogfood",
        description: "Disposable local workspace for exercising real Quipsly workflows.",
        ownerLabel: ACTOR_EMAIL,
        isPrivate: true,
      },
    });
    const project = await prisma.studioProject.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: PROJECT_SLUG } },
      update: {},
      create: {
        workspaceId: workspace.id,
        slug: PROJECT_SLUG,
        name: "High Ground real-work dogfood",
        description: "Real coaching and Episode 4 source-to-writing checks in the local disposable database.",
        sourceLabel: "local-dogfood:research-to-writing",
        isPrivate: true,
      },
    });
    await prisma.studioProjectAccessGrant.upsert({
      where: { projectId_email: { projectId: project.id, email: ACTOR_EMAIL } },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        projectId: project.id,
        email: ACTOR_EMAIL,
        role: "OWNER",
        status: "ACTIVE",
        createdByUserId: actor.id,
        createdByEmail: ACTOR_EMAIL,
        note: "Local-only dogfood identity; never a production grant.",
      },
    });

    const outcomes = [];
    for (const fixture of fixtures) {
      const source = await ensureSource(prisma, project.id, fixture);
      const tag = await prisma.studioTag.upsert({
        where: { projectId_slug: { projectId: project.id, slug: fixture.tag.slug } },
        update: {
          label: fixture.tag.label,
          category: fixture.tag.category,
          isActive: true,
        },
        create: {
          projectId: project.id,
          slug: fixture.tag.slug,
          label: fixture.tag.label,
          description: "Created by the local research-to-writing dogfood lane.",
          category: fixture.tag.category,
          nodeType: "source_note",
          isPrivate: false,
          isActive: true,
        },
      });
      const annotation = requireOk(await createSourceAnnotation(prisma, {
        projectId: project.id,
        sourceUnitId: source.id,
        actorUserId: actor.id,
        actorEmail: ACTOR_EMAIL,
        clientRequestId: `local-dogfood-annotation-${fixture.slug}-${fixture.fingerprint.slice(0, 16)}`,
        kind: fixture.annotationKind,
        visibility: "project",
        body: fixture.annotationBody,
        startOffset: fixture.startOffset,
        endOffset: fixture.endOffset,
        exactText: fixture.quote,
        tagIds: [tag.id],
        surface: "nest-research",
      }), `create ${fixture.slug} annotation`);

      const lifecycleExercised = await exerciseReviewLifecycle(prisma, annotation.id, actor.id);
      const currentAnnotation = await prisma.studioSourceAnnotation.findUniqueOrThrow({
        where: { id: annotation.id },
        select: { updatedAt: true },
      });
      const draft = requireOk(await createWritingDraftFromSourceAnnotation(prisma, {
        annotationId: annotation.id,
        projectId: project.id,
        projectSlug: project.slug,
        actorUserId: actor.id,
        actorEmail: ACTOR_EMAIL,
        clientRequestId: `local-dogfood-draft-${fixture.slug}-${fixture.fingerprint.slice(0, 16)}`,
        expectedUpdatedAt: currentAnnotation.updatedAt,
      }), `create ${fixture.slug} writing draft`);

      const persisted = await prisma.studioSourceAnnotation.findUniqueOrThrow({
        where: { id: annotation.id },
        include: {
          sourceUnit: { select: { immutableText: true, metadataJson: true } },
          revisions: { orderBy: { revision: "asc" } },
          uses: {
            include: {
              document: { select: { id: true, title: true, isPrivate: true } },
              block: { select: { externalId: true, body: true } },
            },
          },
          tags: true,
        },
      });
      const use = persisted.uses[0];
      const sourceFingerprint = sha256(persisted.sourceUnit.immutableText ?? "");
      const verified = Boolean(
        use
        && persisted.sourceUnit.immutableText?.slice(persisted.startOffset, persisted.endOffset) === persisted.exactText
        && sourceFingerprint === persisted.sourceFingerprint
        && use.quoteSnapshot === persisted.exactText
        && use.block.externalId === `annotation:${persisted.id}`
        && use.block.body.includes(use.citationKey)
        && use.block.body.includes(use.quoteSnapshot)
        && use.document.isPrivate
        && persisted.revisions.length >= 3
        && persisted.tags.some((item) => item.tagId === tag.id)
      );
      if (!verified) {
        throw new Error(`Persisted readback failed for ${fixture.slug}.`);
      }

      outcomes.push({
        fixture: fixture.slug,
        sourceUnitId: source.id,
        sourceFingerprint,
        annotationId: persisted.id,
        annotationStatus: persisted.status,
        revisionCount: persisted.revisions.length,
        lifecycleExercised,
        draftDocumentId: use.document.id,
        draftHref: draft.href,
        draftPrivate: use.document.isPrivate,
        sourceMutated: false,
        persistedReadback: verified,
        reused: { annotation: annotation.reused, draft: draft.reused },
      });
    }

    const registryReadback = await lookupStudioProjectDocument(prisma, project.slug);
    if (registryReadback.project.id !== project.id || !registryReadback.document?.id) {
      throw new Error("Create project lookup did not reopen the canonical dogfood Nest.");
    }

    console.log(JSON.stringify({
      applied: true,
      localOnly: true,
      project: {
        id: project.id,
        slug: project.slug,
        createProjectLookupResolved: true,
        reopenedDocumentId: registryReadback.document.id,
      },
      outcomes,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
