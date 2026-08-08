import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  EXTERNAL_SOURCE_PROXY_MAX_DIMENSION,
  SOURCE_VISUAL_OVERVIEW_COLUMNS,
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_PROFILE,
  SOURCE_VISUAL_OVERVIEW_ROWS,
  SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
  newExternalSourceProxyResult,
  newSourceAudioNavigationJob,
  newSourceVisualOverviewJob,
  parseExternalSourceProxyJob,
  parseSourceAudioNavigationJob,
  parseSourceVisualOverviewJob,
  sourceAudioNavigationIdentity,
  sourceVisualOverviewIdentity,
  type ExternalSourceProxyJob,
  type ExternalSourceProxyResult,
} from "@high-ground/quipsly-media-processing";
import {
  buildSourceVisualOverviewTargetLocator,
  sourceAudioNavigationJobId,
  sourceVisualOverviewDerivativeId,
  sourceVisualOverviewJobId,
} from "@high-ground/quipsly-media-processing/source-navigation-identity";
import type pg from "pg";

import {
  FfmpegCaptureProxyTranscoder,
  ProxyTranscodeError,
  sha256File,
  type CaptureProxyTranscoder,
} from "./transcoder.js";

const JOB_TYPE = "external-source-proxy";
const JOB_SOURCE = "source-story.external-proxy";
const VISUAL_JOB_TYPE = "source-visual-overview";
const VISUAL_JOB_SOURCE = "source-story.visual-overview";
const AUDIO_JOB_TYPE = "source-audio-navigation";
const AUDIO_JOB_SOURCE = "source-story.audio-navigation";

type Pool = InstanceType<typeof pg.Pool>;

export type LocalExternalSourceProxyClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export type ResolvedExternalSource = {
  path: string;
  projectId: string;
  referenceId: string;
  sourceRevisionId: string;
  revisionKey: string;
  identitySha256: string;
  contentSha256: string;
  sizeBytes: number;
  accessState: string;
  capabilityState: string;
  provider: string;
};

export interface LocalExternalSourceProxyStore {
  claim(input: {
    executionId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalExternalSourceProxyClaim | null>;
  resolve(
    claim: LocalExternalSourceProxyClaim,
    job: ExternalSourceProxyJob,
  ): Promise<ResolvedExternalSource>;
  complete(input: {
    claim: LocalExternalSourceProxyClaim;
    job: ExternalSourceProxyJob;
    receipt: ExternalSourceProxyResult;
    now: Date;
  }): Promise<boolean>;
  retry(input: {
    claim: LocalExternalSourceProxyClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalExternalSourceProxyClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export type LocalExternalSourceProxyOptions = {
  executionId: string;
  buildId: string;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalExternalSourceProxyWorkerResult =
  | { disposition: "idle" }
  | {
      disposition: "completed";
      jobId: string;
      outputPath: string;
      recoveredExistingOutput: boolean;
    }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class ExternalProxyTerminalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExternalProxyTerminalError";
  }
}

export function sourceNavigationJobsFromExternalProxy(input: {
  job: ExternalSourceProxyJob;
  receipt: ExternalSourceProxyResult;
  queuedAt: string;
}) {
  const visualIdentity = sourceVisualOverviewIdentity({
    projectId: input.job.projectId,
    sourceRevisionId: input.job.source.sourceRevisionId,
    sourceIdentitySha256: input.job.source.identitySha256,
    inputGeneration: input.receipt.output.generation,
  });
  const audioIdentity = sourceAudioNavigationIdentity({
    projectId: input.job.projectId,
    sourceRevisionId: input.job.source.sourceRevisionId,
    sourceIdentitySha256: input.job.source.identitySha256,
    inputGeneration: input.receipt.output.generation,
  });
  const shared = {
    projectId: input.job.projectId,
    projectSlug: input.job.projectSlug,
    actorUserId: input.job.actorUserId,
    actorEmail: input.job.actorEmail,
    queuedAt: input.queuedAt,
    source: {
      sourceRevisionId: input.job.source.sourceRevisionId,
      identitySha256: input.job.source.identitySha256,
      expectedContentSha256: input.job.source.expectedContentSha256,
    },
    input: {
      derivativeId: input.job.derivativeId,
      provider: "local" as const,
      locator: input.receipt.output.locator,
      generation: input.receipt.output.generation,
      contentSha256: input.receipt.output.sha256,
      sizeBytes: input.receipt.output.sizeBytes,
      contentType: input.receipt.output.contentType,
      durationSeconds: input.receipt.output.durationSeconds,
    },
  };
  const visualJobId = sourceVisualOverviewJobId(visualIdentity);
  const audioJobId = sourceAudioNavigationJobId(audioIdentity);
  return {
    visual: newSourceVisualOverviewJob({
      ...shared,
      jobId: visualJobId,
      derivativeId: sourceVisualOverviewDerivativeId(visualIdentity),
      target: {
        provider: "local",
        locator: buildSourceVisualOverviewTargetLocator({
          projectSlug: input.job.projectSlug,
          sourceRevisionId: input.job.source.sourceRevisionId,
          inputContentSha256: input.receipt.output.sha256,
        }),
        contentType: "image/jpeg",
        derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
        profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
        columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
        rows: SOURCE_VISUAL_OVERVIEW_ROWS,
        sampleCount: SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
      },
    }),
    audio: newSourceAudioNavigationJob({
      ...shared,
      jobId: audioJobId,
    }),
  };
}

export async function runOneLocalExternalSourceProxyJob(
  store: LocalExternalSourceProxyStore,
  transcoder: CaptureProxyTranscoder,
  options: LocalExternalSourceProxyOptions,
): Promise<LocalExternalSourceProxyWorkerResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };

  let job: ExternalSourceProxyJob;
  try {
    job = parseExternalSourceProxyJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({
      claim,
      code: "external-proxy-job-invalid",
      message: message(error, "External proxy job is invalid."),
      now: options.now(),
    });
    return {
      disposition: "failed",
      jobId: claim.id,
      code: "external-proxy-job-invalid",
    };
  }

  let partialPath = "";
  let outputPath = "";
  let createdOutput = false;
  try {
    const resolved = await store.resolve(claim, job);
    assertResolvedSource(job, resolved);
    const sourcePath = await realpath(resolved.path).catch(() => "");
    if (!sourcePath || !path.isAbsolute(sourcePath)) {
      throw new ExternalProxyTerminalError(
        "external-proxy-source-unavailable",
        "The retained local source path is unavailable.",
      );
    }
    const sourceBefore = await inspectSource(sourcePath);
    assertSourceBytes(job, sourceBefore);

    const root = await authorizedOutputRoot(options.localMediaRoot);
    outputPath = authorizedTargetPath(root, job.target.locator);
    partialPath = `${outputPath.slice(0, -4)}.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]+/g, "-")}.mp4`;
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });

    let proxy;
    let recoveredExistingOutput = false;
    const existing = await stat(outputPath).catch(() => null);
    if (existing) {
      if (!existing.isFile() || !transcoder.inspect) {
        throw new ExternalProxyTerminalError(
          "external-proxy-existing-output-invalid",
          "An existing proxy cannot be independently inspected.",
        );
      }
      proxy = await transcoder.inspect(outputPath);
      recoveredExistingOutput = true;
    } else {
      await rm(partialPath, { force: true });
      proxy = await transcoder.transcode(sourcePath, partialPath);
      await flushFile(partialPath);
      await rename(partialPath, outputPath);
      createdOutput = true;
    }

    const sourceAfter = await inspectSource(sourcePath);
    assertSourceBytes(job, sourceAfter);
    if (
      sourceBefore.sha256 !== sourceAfter.sha256 ||
      sourceBefore.sizeBytes !== sourceAfter.sizeBytes
    ) {
      throw new ExternalProxyTerminalError(
        "external-proxy-source-drift",
        "The original changed while its collaboration proxy was generated.",
      );
    }
    if (proxy.sizeBytes >= sourceBefore.sizeBytes) {
      throw new ExternalProxyTerminalError(
        "external-proxy-not-storage-efficient",
        "The generated browsing derivative was not smaller than its source. Adjust the profile before retaining it.",
      );
    }
    const receipt = newExternalSourceProxyResult({
      jobId: job.jobId,
      derivativeId: job.derivativeId,
      completedAt: options.now().toISOString(),
      source: {
        ...job.source,
        observedContentSha256: sourceAfter.sha256,
        observedSizeBytes: sourceAfter.sizeBytes,
      },
      output: {
        provider: "local",
        locator: outputPath,
        generation: `sha256:${proxy.sha256}`,
        contentType: "video/mp4",
        profile: job.target.profile,
        sha256: proxy.sha256,
        sizeBytes: proxy.sizeBytes,
        durationSeconds: proxy.technical.durationSeconds,
        widthPixels: proxy.technical.width,
        heightPixels: proxy.technical.height,
        framesPerSecond: proxy.technical.fps,
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        attempt: claim.attempt,
      },
    });
    const committed = await store.complete({
      claim,
      job,
      receipt,
      now: options.now(),
    });
    return committed
      ? {
          disposition: "completed",
          jobId: job.jobId,
          outputPath,
          recoveredExistingOutput,
        }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    if (error instanceof ExternalProxyTerminalError) {
      if (createdOutput && outputPath)
        await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({
        claim,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code: error.code };
    }
    const code =
      error instanceof ProxyTranscodeError
        ? error.code
        : "external-proxy-worker-retry";
    const detail = message(
      error,
      "The local external-source proxy worker needs retry.",
    );
    if (error instanceof ProxyTranscodeError && !error.retryable) {
      await store.fail({ claim, code, message: detail, now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message: detail, now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalExternalSourceProxyStore implements LocalExternalSourceProxyStore {
  constructor(private readonly pool: Pool) {}

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const staleBefore = new Date(input.now.getTime() - input.leaseMs);
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioWorkflowJob"
          WHERE "type"=$1 AND "source"=$2
            AND "inputJson"->'source'->>'provider' IN ('local-file-vault','google-drive')
            AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC', $3::timestamptz)))
          ORDER BY "priority" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
        `,
        values: [JOB_TYPE, JOB_SOURCE, staleBefore],
      });
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const previous = asRecord(row.resultJson);
      const previousLease = asRecord(previous.lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const resultJson = {
        ...previous,
        state: "processing",
        lease: {
          executionId: input.executionId,
          attempt,
          claimedAt: input.now.toISOString(),
          expiresAt: new Date(
            input.now.getTime() + input.leaseMs,
          ).toISOString(),
        },
        originalRemainsSourceTruth: true,
      };
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing', "startedAt"=COALESCE("startedAt",timezone('UTC',$2::timestamptz)), "updatedAt"=timezone('UTC',$2::timestamptz), "error"=NULL, "resultJson"=$3::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`,
        values: [row.id, input.now, JSON.stringify(resultJson)],
      });
      await client.query("COMMIT");
      return {
        id: updated.rows[0].id,
        inputJson: updated.rows[0].inputJson,
        attempt,
        executionId: input.executionId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(
    _claim: LocalExternalSourceProxyClaim,
    job: ExternalSourceProxyJob,
  ) {
    const result = await this.pool.query({
      text: `
        SELECT r."projectId", r."id" AS "referenceId", r."provider", r."accessState", r."capabilityState",
               r."providerLocatorJson", s."id" AS "sourceRevisionId", s."revisionKey", s."identitySha256",
               s."contentSha256", s."sizeBytes", replica."locator" AS "replicaLocator"
        FROM "StudioMediaSourceRevision" s
        JOIN "StudioExternalMediaReference" r ON r."id"=s."externalReferenceId"
        LEFT JOIN LATERAL (
          SELECT "locator"
          FROM "StudioMediaSourceReplica"
          WHERE "sourceRevisionId"=s."id" AND "storageProvider"='local-cache' AND "status"='ready'
          ORDER BY "createdAt" DESC LIMIT 1
        ) replica ON TRUE
        WHERE s."id"=$1 AND r."id"=$2 AND s."projectId"=$3
      `,
      values: [
        job.source.sourceRevisionId,
        job.source.externalReferenceId,
        job.projectId,
      ],
    });
    const row = result.rows[0];
    if (!row)
      throw new ExternalProxyTerminalError(
        "external-proxy-source-revision-missing",
        "The exact source revision no longer exists.",
      );
    const locator = asRecord(row.providerLocatorJson);
    return {
      path:
        row.provider === "google-drive"
          ? typeof row.replicaLocator === "string"
            ? row.replicaLocator
            : ""
          : typeof locator.localPath === "string"
            ? locator.localPath
            : "",
      projectId: row.projectId,
      referenceId: row.referenceId,
      sourceRevisionId: row.sourceRevisionId,
      revisionKey: row.revisionKey,
      identitySha256: row.identitySha256,
      contentSha256: row.contentSha256,
      sizeBytes: Number(row.sizeBytes),
      accessState: row.accessState,
      capabilityState: row.capabilityState,
      provider: row.provider,
    };
  }

  async complete(input: {
    claim: LocalExternalSourceProxyClaim;
    job: ExternalSourceProxyJob;
    receipt: ExternalSourceProxyResult;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready', "updatedAt"=timezone('UTC',$3::timestamptz), "completedAt"=timezone('UTC',$3::timestamptz), "error"=NULL, "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
        values: [
          input.claim.id,
          input.claim.executionId,
          input.now,
          JSON.stringify({
            state: "output-ready",
            receipt: input.receipt,
            originalRemainsSourceTruth: true,
          }),
        ],
      });
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query({
        text: `
          INSERT INTO "StudioMediaDerivative" (
            "id","projectId","sourceRevisionId","workflowJobId","kind","profile","storageProvider","locator","generation",
            "contentSha256","sizeBytes","mimeType","durationSeconds","widthPixels","heightPixels","framesPerSecond",
            "status","verificationJson","provenanceJson","createdByUserId","createdAt"
          ) VALUES ($1,$2,$3,$4,'collaboration-proxy',$5,'local',$6,$7,$8,$9,'video/mp4',$10,$11,$12,$13,'ready',$14::jsonb,$15::jsonb,$16,$17)
          ON CONFLICT ("id") DO NOTHING
        `,
        values: [
          input.job.derivativeId,
          input.job.projectId,
          input.job.source.sourceRevisionId,
          input.job.jobId,
          input.job.target.profile,
          input.receipt.output.locator,
          input.receipt.output.generation,
          input.receipt.output.sha256,
          input.receipt.output.sizeBytes,
          input.receipt.output.durationSeconds,
          input.receipt.output.widthPixels,
          input.receipt.output.heightPixels,
          input.receipt.output.framesPerSecond,
          JSON.stringify({
            schema: "quipsly-media-derivative-verification-v1",
            source: input.receipt.source,
            output: input.receipt.output,
            originalRemainsSourceTruth: true,
          }),
          JSON.stringify({
            schema: "quipsly-media-derivative-provenance-v1",
            jobId: input.job.jobId,
            worker: input.receipt.worker,
          }),
          input.job.actorUserId,
          input.now,
        ],
      });
      await client.query({
        text: `UPDATE "StudioMediaDerivative" SET "status"='superseded' WHERE "projectId"=$1 AND "sourceRevisionId"=$2 AND "kind"='collaboration-proxy' AND "status"='ready' AND "id"<>$3`,
        values: [
          input.job.projectId,
          input.job.source.sourceRevisionId,
          input.job.derivativeId,
        ],
      });
      await client.query({
        text: `UPDATE "StudioMediaSourceRevision" SET "durationSeconds"=COALESCE("durationSeconds",$2), "widthPixels"=COALESCE("widthPixels",$3), "heightPixels"=COALESCE("heightPixels",$4), "framesPerSecond"=COALESCE("framesPerSecond",$5) WHERE "id"=$1`,
        values: [
          input.job.source.sourceRevisionId,
          input.receipt.output.durationSeconds,
          input.receipt.output.widthPixels,
          input.receipt.output.heightPixels,
          input.receipt.output.framesPerSecond,
        ],
      });
      const retained = await client.query({
        text: `SELECT "sourceRevisionId","workflowJobId","generation","contentSha256","sizeBytes" FROM "StudioMediaDerivative" WHERE "id"=$1`,
        values: [input.job.derivativeId],
      });
      const row = retained.rows[0];
      if (
        !row ||
        row.sourceRevisionId !== input.job.source.sourceRevisionId ||
        row.workflowJobId !== input.job.jobId ||
        row.generation !== input.receipt.output.generation ||
        row.contentSha256 !== input.receipt.output.sha256 ||
        Number(row.sizeBytes) !== input.receipt.output.sizeBytes
      ) {
        throw new ExternalProxyTerminalError(
          "external-proxy-derivative-conflict",
          "The derivative identity is already bound to different output evidence.",
        );
      }

      const navigation = sourceNavigationJobsFromExternalProxy({
        job: input.job,
        receipt: input.receipt,
        queuedAt: input.now.toISOString(),
      });
      await client.query({
        text: `
          INSERT INTO "StudioWorkflowJob" (
            "id","projectId","type","status","source","priority","inputJson","resultJson","requestedByEmail","createdAt","updatedAt"
          ) VALUES
            ($1,$2,$3,'queued',$4,72,$5::jsonb,$6::jsonb,$7,$8,$8),
            ($9,$2,$10,'queued',$11,73,$12::jsonb,$13::jsonb,$7,$8,$8)
          ON CONFLICT ("id") DO NOTHING
        `,
        values: [
          navigation.visual.jobId,
          input.job.projectId,
          VISUAL_JOB_TYPE,
          VISUAL_JOB_SOURCE,
          JSON.stringify(navigation.visual),
          JSON.stringify({
            state: "queued",
            requestedBy: {
              actorUserId: input.job.actorUserId,
              actorEmail: input.job.actorEmail,
              proxyJobId: input.job.jobId,
            },
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
          }),
          input.job.actorEmail,
          input.now,
          navigation.audio.jobId,
          AUDIO_JOB_TYPE,
          AUDIO_JOB_SOURCE,
          JSON.stringify(navigation.audio),
          JSON.stringify({
            state: "queued",
            requestedBy: {
              actorUserId: input.job.actorUserId,
              actorEmail: input.job.actorEmail,
              proxyJobId: input.job.jobId,
            },
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
            analysisDoesNotChangeMedia: true,
          }),
        ],
      });
      const retainedNavigation = await client.query({
        text: `SELECT "id","inputJson" FROM "StudioWorkflowJob" WHERE "id" IN ($1,$2)`,
        values: [navigation.visual.jobId, navigation.audio.jobId],
      });
      const retainedById = new Map(
        retainedNavigation.rows.map((job) => [job.id, job.inputJson]),
      );
      assertRetainedNavigationMatches(
        navigation.visual,
        parseSourceVisualOverviewJob(
          retainedById.get(navigation.visual.jobId),
          navigation.visual.jobId,
        ),
      );
      assertRetainedNavigationMatches(
        navigation.audio,
        parseSourceAudioNavigationJob(
          retainedById.get(navigation.audio.jobId),
          navigation.audio.jobId,
        ),
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async retry(input: {
    claim: LocalExternalSourceProxyClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "queued");
  }

  async fail(input: {
    claim: LocalExternalSourceProxyClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "failed");
  }

  private async release(
    input: {
      claim: LocalExternalSourceProxyClaim;
      code: string;
      message: string;
      now: Date;
    },
    status: "queued" | "failed",
  ) {
    const current = await this.pool.query({
      text: `SELECT "resultJson" FROM "StudioWorkflowJob" WHERE "id"=$1`,
      values: [input.claim.id],
    });
    const previous = asRecord(current.rows[0]?.resultJson);
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"=$3, "updatedAt"=timezone('UTC',$4::timestamptz), "completedAt"=CASE WHEN $3='failed' THEN timezone('UTC',$4::timestamptz) ELSE NULL END, "error"=$5, "resultJson"=$6::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        input.now,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({
          ...previous,
          state: status,
          failure: {
            code: input.code,
            message: input.message,
            failedAt: input.now.toISOString(),
            attempt: input.claim.attempt,
          },
          lease: {
            executionId: input.claim.executionId,
            attempt: input.claim.attempt,
          },
          originalRemainsSourceTruth: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

function assertRetainedNavigationMatches(
  expected:
    | ReturnType<typeof newSourceVisualOverviewJob>
    | ReturnType<typeof newSourceAudioNavigationJob>,
  retained:
    | ReturnType<typeof newSourceVisualOverviewJob>
    | ReturnType<typeof newSourceAudioNavigationJob>,
) {
  const stableIntent = (job: typeof expected) => ({
    jobId: job.jobId,
    projectId: job.projectId,
    projectSlug: job.projectSlug,
    source: job.source,
    input: job.input,
    ...("derivativeId" in job
      ? { derivativeId: job.derivativeId, target: job.target }
      : { analyzer: job.analyzer }),
  });
  if (
    JSON.stringify(stableIntent(expected)) !==
    JSON.stringify(stableIntent(retained))
  ) {
    throw new ExternalProxyTerminalError(
      "source-navigation-job-conflict",
      "A retained source-navigation identity is bound to different proxy evidence.",
    );
  }
}

export function newLocalExternalSourceProxyRuntime(input: {
  pool: Pool;
  executionId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalExternalSourceProxyStore(input.pool),
    transcoder: new FfmpegCaptureProxyTranscoder(undefined, undefined, {
      maxDimension: EXTERNAL_SOURCE_PROXY_MAX_DIMENSION,
      crf: 30,
      audioBitrate: "80k",
    }),
    options: {
      executionId: input.executionId,
      buildId: input.buildId,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalExternalSourceProxyOptions,
  };
}

function assertResolvedSource(
  job: ExternalSourceProxyJob,
  source: ResolvedExternalSource,
) {
  if (
    source.projectId !== job.projectId ||
    source.referenceId !== job.source.externalReferenceId ||
    source.sourceRevisionId !== job.source.sourceRevisionId ||
    source.revisionKey !== job.source.revisionKey ||
    source.identitySha256 !== job.source.identitySha256 ||
    source.contentSha256 !== job.source.expectedContentSha256 ||
    source.sizeBytes !== job.source.expectedSizeBytes ||
    source.provider !== job.source.provider ||
    source.accessState !== "available" ||
    source.capabilityState !== "downloadable"
  ) {
    throw new ExternalProxyTerminalError(
      "external-proxy-source-binding-changed",
      "The retained external source no longer matches the queued exact-revision contract.",
    );
  }
}

async function inspectSource(sourcePath: string) {
  const details = await stat(sourcePath);
  if (!details.isFile() || details.size <= 0)
    throw new ExternalProxyTerminalError(
      "external-proxy-source-unavailable",
      "The retained external source is empty or unavailable.",
    );
  return { sizeBytes: details.size, sha256: await sha256File(sourcePath) };
}

function assertSourceBytes(
  job: ExternalSourceProxyJob,
  source: { sizeBytes: number; sha256: string },
) {
  if (
    source.sizeBytes !== job.source.expectedSizeBytes ||
    source.sha256 !== job.source.expectedContentSha256
  ) {
    throw new ExternalProxyTerminalError(
      "external-proxy-source-byte-mismatch",
      "The local file no longer matches the retained immutable source revision.",
    );
  }
}

async function authorizedOutputRoot(configuredRoot: string) {
  const root = path.resolve(configuredRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return realpath(root);
}

function authorizedTargetPath(root: string, locator: string) {
  const output = path.resolve(root, locator);
  const relative = path.relative(root, output);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !output.endsWith(".mp4")
  ) {
    throw new ExternalProxyTerminalError(
      "external-proxy-target-path-rejected",
      "The proxy target escaped its dedicated output root.",
    );
  }
  return output;
}

async function flushFile(filePath: string) {
  const handle = await open(filePath, "r+");
  try {
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
