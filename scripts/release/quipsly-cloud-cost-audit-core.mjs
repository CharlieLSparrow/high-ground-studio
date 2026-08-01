const CLOUD_BUILD_RATES_US_CENTRAL1 = Object.freeze({
  E2_MEDIUM: 0.003,
  E2_STANDARD_2: 0.006,
  E2_HIGHCPU_8: 0.0156,
  N1_HIGHCPU_8: 0.0156,
  E2_HIGHCPU_32: 0.0624,
  N1_HIGHCPU_32: 0.0624,
});

export function summarizeQuipslyCloudCost(input) {
  const now = parseDate(input.auditedAt, "auditedAt");
  const builds = Array.isArray(input.builds) ? input.builds : [];
  const images = Array.isArray(input.images) ? input.images : [];
  const revisions = Array.isArray(input.revisions) ? input.revisions : [];
  const cleanupPolicies = Array.isArray(input.cleanupPolicies)
    ? input.cleanupPolicies
    : [];
  const service = object(input.service);
  const protectedRevisions = protectedRevisionNames(service);
  const protectedDigests = new Set(
    revisions
      .filter((revision) =>
        protectedRevisions.has(text(object(revision.metadata).name)),
      )
      .map(revisionDigest)
      .filter(Boolean),
  );
  const buildSummary = summarizeBuilds(builds);
  const imageSummary = summarizeImages(images, now, protectedDigests);

  const recommendations = [];
  if (buildSummary.repeatedCommittedSourceBuildCount > 0) {
    recommendations.push({
      priority: "high",
      code: "reuse-exact-source-image",
      finding: `${buildSummary.repeatedCommittedSourceBuildCount} build(s) repeated a committed source identity in this audit window.`,
      action:
        "Reuse the verified source-SHA image for preview retries and promotion.",
    });
  }
  if (
    buildSummary.byMachineType.some(
      (entry) => entry.machineType === "E2_HIGHCPU_32",
    )
  ) {
    recommendations.push({
      priority: "high",
      code: "benchmark-smaller-build-worker",
      finding:
        "Quipsly uses the most expensive default-pool worker class in this audit.",
      action:
        "Benchmark E2_HIGHCPU_8 on one non-urgent exact-source build; retain E2_HIGHCPU_32 only if the smaller worker is not materially cheaper or reliable.",
    });
  }
  if (imageSummary.olderThan30DaysCount > 0 && cleanupPolicies.length === 0) {
    recommendations.push({
      priority: "high",
      code: "dry-run-artifact-cleanup",
      finding: `${imageSummary.olderThan30DaysCount} image version(s) are older than 30 days and no cleanup policy was read back.`,
      action:
        "Create a dry-run keep/delete policy only after protecting live and rollback identities; review its logs before enabling deletion.",
    });
  }
  if (protectedDigests.size === 0) {
    recommendations.push({
      priority: "blocker",
      code: "live-digest-unresolved",
      finding: "No traffic-serving Cloud Run digest was resolved.",
      action:
        "Do not enable Artifact Registry deletion until live revision digest readback succeeds.",
    });
  }

  return {
    schema: "quipsly-cloud-cost-audit-v1",
    auditedAt: now.toISOString(),
    windowStartedAt: text(input.windowStartedAt),
    projectId: text(input.projectId),
    region: text(input.region),
    repository: text(input.repository),
    service: text(input.serviceName),
    builds: buildSummary,
    artifacts: {
      ...imageSummary,
      cleanupPolicyCount: cleanupPolicies.length,
      cleanupMutationPerformed: false,
    },
    cloudRun: {
      revisionCount: revisions.length,
      trafficServingRevisionCount: protectedRevisions.size,
      trafficServingDigestCount: protectedDigests.size,
      minimumInstanceCount: minimumInstanceCount(service),
      billingMode:
        text(
          object(object(service.metadata).annotations)[
            "run.googleapis.com/billing-mode"
          ],
        ) || "unspecified",
    },
    recommendations,
    boundaries: {
      readOnly: true,
      artifactDeletionPerformed: false,
      cleanupPolicyChanged: false,
      serviceChanged: false,
      databaseChanged: false,
    },
  };
}

function summarizeBuilds(builds) {
  const statusCounts = new Map();
  const machineTypes = new Map();
  const sourceCounts = new Map();
  let totalDurationSeconds = 0;
  let estimatedComputeUsd = 0;
  let pricedBuildCount = 0;
  let unpricedBuildCount = 0;

  for (const build of builds) {
    const status = text(build.status) || "UNKNOWN";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const machineType = normalizedMachineType(
      object(build.options).machineType,
    );
    const durationSeconds = buildDurationSeconds(build);
    totalDurationSeconds += durationSeconds;
    const rate = CLOUD_BUILD_RATES_US_CENTRAL1[machineType] ?? null;
    const machine = machineTypes.get(machineType) ?? {
      machineType,
      buildCount: 0,
      durationSeconds: 0,
      estimatedComputeUsd: null,
    };
    machine.buildCount += 1;
    machine.durationSeconds += durationSeconds;
    if (rate == null) {
      unpricedBuildCount += 1;
    } else {
      const cost = (durationSeconds / 60) * rate;
      pricedBuildCount += 1;
      estimatedComputeUsd += cost;
      machine.estimatedComputeUsd = (machine.estimatedComputeUsd ?? 0) + cost;
    }
    machineTypes.set(machineType, machine);
    const sourceIdentity = committedSourceIdentity(build);
    if (sourceIdentity) {
      sourceCounts.set(
        sourceIdentity,
        (sourceCounts.get(sourceIdentity) ?? 0) + 1,
      );
    }
  }

  const repeatedGroups = [...sourceCounts.values()].filter(
    (count) => count > 1,
  );
  return {
    buildCount: builds.length,
    statusCounts: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => left.status.localeCompare(right.status)),
    totalDurationSeconds,
    estimatedComputeUsd: roundMoney(estimatedComputeUsd),
    pricedBuildCount,
    unpricedBuildCount,
    committedSourceIdentityCount: sourceCounts.size,
    repeatedCommittedSourceGroupCount: repeatedGroups.length,
    repeatedCommittedSourceBuildCount: repeatedGroups.reduce(
      (sum, count) => sum + count - 1,
      0,
    ),
    byMachineType: [...machineTypes.values()]
      .map((entry) => ({
        ...entry,
        estimatedComputeUsd:
          entry.estimatedComputeUsd == null
            ? null
            : roundMoney(entry.estimatedComputeUsd),
      }))
      .sort((left, right) => left.machineType.localeCompare(right.machineType)),
    pricingBasis:
      "Google Cloud us-central1 default-pool list price captured 2026-08-01; excludes free-tier credits, storage, logging, tax, and negotiated discounts.",
  };
}

function summarizeImages(images, now, protectedDigests) {
  let taggedVersionCount = 0;
  let untaggedVersionCount = 0;
  let olderThan30DaysCount = 0;
  let knownSizeVersionCount = 0;
  let knownSizeBytes = 0;
  let protectedVersionCount = 0;
  const packages = new Set();
  for (const image of images) {
    const tags = Array.isArray(image.tags) ? image.tags.filter(Boolean) : [];
    if (tags.length > 0) taggedVersionCount += 1;
    else untaggedVersionCount += 1;
    const updatedAt = dateOrNull(image.updateTime ?? image.createTime);
    if (updatedAt && now.getTime() - updatedAt.getTime() > 30 * 86_400_000) {
      olderThan30DaysCount += 1;
    }
    const sizeBytes = nonNegativeNumber(
      image.imageSizeBytes ??
        image.sizeBytes ??
        object(image.metadata).imageSizeBytes,
    );
    if (sizeBytes != null) {
      knownSizeVersionCount += 1;
      knownSizeBytes += sizeBytes;
    }
    const digest = imageDigest(image);
    if (digest && protectedDigests.has(digest)) protectedVersionCount += 1;
    const packageName = imagePackage(image);
    if (packageName) packages.add(packageName);
  }
  return {
    packageCount: packages.size,
    versionCount: images.length,
    taggedVersionCount,
    untaggedVersionCount,
    olderThan30DaysCount,
    knownSizeVersionCount,
    unknownSizeVersionCount: images.length - knownSizeVersionCount,
    knownSizeBytes,
    trafficServingProtectedVersionCount: protectedVersionCount,
  };
}

function protectedRevisionNames(service) {
  const names = new Set();
  for (const traffic of array(object(service.status).traffic)) {
    const revisionName = text(object(traffic).revisionName);
    const percent = Number(object(traffic).percent ?? 0);
    if (revisionName && (percent > 0 || object(traffic).tag))
      names.add(revisionName);
  }
  return names;
}

function revisionDigest(revision) {
  const status = object(revision.status);
  const direct = text(status.imageDigest);
  if (/^sha256:[0-9a-f]{64}$/.test(direct)) return direct;
  const image =
    text(array(object(object(revision.spec).template).containers)[0]?.image) ||
    text(array(object(revision.spec).containers)[0]?.image);
  const match = image.match(/@((?:sha256:)[0-9a-f]{64})$/);
  return match?.[1] ?? "";
}

function minimumInstanceCount(service) {
  const annotations = object(
    object(object(service.spec).template).metadata,
  ).annotations;
  const raw = text(object(annotations)["autoscaling.knative.dev/minScale"]);
  const parsed = Number(raw || 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function committedSourceIdentity(build) {
  const substitutions = object(build.substitutions);
  const value = text(
    substitutions._QUIPSLY_BUILD_ID ??
      substitutions._SOURCE_SHA ??
      substitutions.COMMIT_SHA,
  );
  return /^[0-9a-f]{40}$/.test(value) ? value : "";
}

function buildDurationSeconds(build) {
  const start = dateOrNull(build.startTime ?? build.createTime);
  const finish = dateOrNull(build.finishTime);
  return start && finish
    ? Math.max(0, (finish.getTime() - start.getTime()) / 1_000)
    : 0;
}

function normalizedMachineType(value) {
  return (text(value) || "UNSPECIFIED")
    .replace(/^.*\//, "")
    .replaceAll("-", "_")
    .toUpperCase();
}

function imageDigest(image) {
  const direct = text(image.version ?? image.digest);
  const match = direct.match(/sha256:[0-9a-f]{64}$/);
  return match?.[0] ?? "";
}

function imagePackage(image) {
  const direct = text(image.package ?? image.name);
  if (!direct) return "";
  return direct
    .replace(/@sha256:[0-9a-f]{64}$/, "")
    .replace(/\/versions\/.*$/, "");
}

function parseDate(value, field) {
  const parsed = dateOrNull(value);
  if (!parsed) throw new Error(`${field} must be a valid date.`);
  return parsed;
}

function dateOrNull(value) {
  const parsed = new Date(text(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function roundMoney(value) {
  return Math.round(value * 10_000) / 10_000;
}

function nonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
