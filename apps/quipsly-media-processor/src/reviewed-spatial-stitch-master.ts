import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import {
  newReviewedSpatialStitchMasterReceipt,
  reviewedSpatialStitchMasterCanonicalJson,
  type ReviewedSpatialStitchMasterReceipt,
  type SpatialSourceMemberRole,
} from "@high-ground/quipsly-media-processing";

import { sha256File } from "./transcoder.js";

const executeFile = promisify(execFile);

export type ReviewedSpatialSourceMember = {
  sourceRevisionId: string;
  role: SpatialSourceMemberRole;
  fileName: string;
  locator: string;
  generation: string;
  sha256: string;
  sizeBytes: number;
};

export type ReviewedSpatialStitchMasterInput = {
  receiptId?: string;
  clientRequestId: string;
  projectId: string;
  sourceSetId: string;
  sourceSetIdentitySha256: string;
  sourceClockRevisionId: string;
  sourceDurationSeconds: number;
  sourceFramesPerSecond: number;
  exactMembers: ReviewedSpatialSourceMember[];
  outputPath: string;
  review: ReviewedSpatialStitchMasterReceipt["review"];
};

export class ReviewedSpatialStitchMasterError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ReviewedSpatialStitchMasterError";
  }
}

type Execute = (command: string, args: string[], timeout: number) => Promise<{ stdout: string; stderr: string }>;

export class ReviewedSpatialStitchMasterVerifier {
  constructor(
    private readonly ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    private readonly ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
    private readonly execute: Execute = run,
  ) {}

  async verifyAndSeal(input: ReviewedSpatialStitchMasterInput): Promise<ReviewedSpatialStitchMasterReceipt> {
    assertSourceClock(input.sourceDurationSeconds, input.sourceFramesPerSecond);
    const before = await inspectExactMembers(input.exactMembers);
    const output = await inspectOutput(input.outputPath);
    const probe = await this.probe(input.outputPath);
    await this.completeDecode(input.outputPath);
    const after = await inspectExactMembers(input.exactMembers);
    assertMembersUnchanged(before, after);

    const toleranceSeconds = Math.max(0.25, 2 / input.sourceFramesPerSecond);
    if (
      probe.width !== 5760
      || probe.height !== 2880
      || !Number.isFinite(probe.durationSeconds)
      || Math.abs(probe.durationSeconds - input.sourceDurationSeconds) > toleranceSeconds
      || !Number.isFinite(probe.fps)
      || Math.abs(probe.fps - input.sourceFramesPerSecond) > 0.05
    ) {
      throw new ReviewedSpatialStitchMasterError(
        "reviewed-spatial-stitch-output-contract-mismatch",
        "The reviewed export must be a complete 5760×2880 2:1 master with the source clock's duration and frame rate.",
      );
    }

    const unsealed = newReviewedSpatialStitchMasterReceipt({
      receiptId: input.receiptId ?? `spatialstitchreceipt_${randomUUID()}`,
      clientRequestId: input.clientRequestId,
      projectId: input.projectId,
      sourceSetId: input.sourceSetId,
      sourceSetIdentitySha256: input.sourceSetIdentitySha256,
      sourceClockRevisionId: input.sourceClockRevisionId,
      exactMembers: before.map(({ locator: _locator, ...member }) => member),
      output: {
        provider: "local",
        locator: input.outputPath,
        contentType: "video/mp4",
        generation: `sha256:${output.sha256}`,
        sha256: output.sha256,
        sizeBytes: output.sizeBytes,
        durationSeconds: probe.durationSeconds,
        completeDecode: true,
        width: 5760,
        height: 2880,
        fps: probe.fps,
        videoCodec: probe.videoCodec,
        projection: "equirectangular",
      },
      review: input.review,
      receiptSha256: "0".repeat(64),
    });
    return newReviewedSpatialStitchMasterReceipt({
      ...unsealed,
      receiptSha256: createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(unsealed)).digest("hex"),
    });
  }

  private async probe(outputPath: string) {
    const result = await this.safeExecute(this.ffprobePath, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height,avg_frame_rate,r_frame_rate:format=duration",
      "-of", "json", outputPath,
    ], 60_000, "reviewed-spatial-stitch-probe-failed");
    let parsed: { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    try {
      parsed = JSON.parse(result.stdout) as typeof parsed;
    } catch {
      throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-probe-invalid", "FFprobe returned invalid metadata for the reviewed stitch master.");
    }
    const video = parsed.streams?.[0];
    if (!video) throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-video-missing", "The reviewed stitch master has no video stream.");
    return {
      durationSeconds: Number(parsed.format?.duration ?? video.duration),
      width: Number(video.width),
      height: Number(video.height),
      fps: rate(video.avg_frame_rate ?? video.r_frame_rate),
      videoCodec: String(video.codec_name ?? "unknown"),
    };
  }

  private async completeDecode(outputPath: string) {
    await this.safeExecute(this.ffmpegPath, [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-i", outputPath,
      "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-",
    ], 6 * 60 * 60_000, "reviewed-spatial-stitch-complete-decode-failed");
  }

  private async safeExecute(command: string, args: string[], timeout: number, code: string) {
    try {
      return await this.execute(command, args, timeout);
    } catch (error) {
      const detail = error as Error & { code?: string | number; stderr?: string };
      const unavailable = detail.code === "ENOENT";
      throw new ReviewedSpatialStitchMasterError(
        unavailable ? "reviewed-spatial-stitch-engine-unavailable" : code,
        String(detail.stderr || detail.message || error).trim().slice(0, 4_000) || `${command} failed.`,
      );
    }
  }
}

async function inspectExactMembers(members: ReviewedSpatialSourceMember[]) {
  if (!members.length) throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-members-missing", "The exact INSV package is missing.");
  return Promise.all(members.map(async (member) => {
    if (!member.fileName.toLowerCase().endsWith(".insv") || member.locator.toLowerCase().endsWith(".lrv")) {
      throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-member-rejected", "Only exact INSV originals may produce a reviewed stitch master.");
    }
    const file = await stat(member.locator).catch(() => null);
    if (!file?.isFile() || file.size !== member.sizeBytes || file.size <= 0) {
      throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-member-unavailable", `The exact source member ${member.fileName} is unavailable or changed size.`);
    }
    const sha256 = await sha256File(member.locator);
    if (sha256 !== member.sha256 || member.generation !== `sha256:${sha256}`) {
      throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-member-byte-mismatch", `The exact source member ${member.fileName} no longer matches its immutable receipt.`);
    }
    return { ...member, sha256 };
  }));
}

async function inspectOutput(outputPath: string) {
  const file = await stat(outputPath).catch(() => null);
  if (!file?.isFile() || file.size <= 0 || file.size > Number.MAX_SAFE_INTEGER || !outputPath.toLowerCase().endsWith(".mp4")) {
    throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-output-unavailable", "The reviewed stitch output is missing, empty, or not an MP4 file.");
  }
  return { sizeBytes: file.size, sha256: await sha256File(outputPath) };
}

function assertMembersUnchanged(before: Awaited<ReturnType<typeof inspectExactMembers>>, after: Awaited<ReturnType<typeof inspectExactMembers>>) {
  const previous = new Map(before.map((member) => [member.sourceRevisionId, member]));
  if (before.length !== after.length || after.some((member) => {
    const original = previous.get(member.sourceRevisionId);
    return !original || original.sha256 !== member.sha256 || original.sizeBytes !== member.sizeBytes || original.locator !== member.locator;
  })) throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-source-drift", "The exact INSV package changed while the reviewed master was being verified.");
}

function assertSourceClock(durationSeconds: number, fps: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(fps) || fps <= 0) {
    throw new ReviewedSpatialStitchMasterError("reviewed-spatial-stitch-source-clock-invalid", "The source clock duration and frame rate are required for full-export verification.");
  }
}

function rate(value: unknown) {
  const [numerator, denominator = "1"] = String(value ?? "0/1").split("/");
  return Number(numerator) / Math.max(Number(denominator), 1);
}

async function run(command: string, args: string[], timeout: number) {
  return executeFile(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout });
}
