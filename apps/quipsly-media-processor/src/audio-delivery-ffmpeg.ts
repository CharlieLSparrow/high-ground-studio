import { spawn } from "node:child_process";
import { open, stat } from "node:fs/promises";

import type {
  AudioDeliveryJob,
  EpisodeProgramDeliveryJob,
} from "@high-ground/quipsly-media-processing";

import { ProxyTranscodeError, sha256File } from "./transcoder.js";

type Probe = {
  streams?: Array<Record<string, unknown>>;
  format?: Record<string, unknown>;
};

export type EncodedAudioDelivery = {
  outputPath: string;
  sha256: string;
  sizeBytes: number;
  contentType: "audio/mp4";
  codec: "aac";
  codecProfile: "LC";
  container: "mov,mp4,m4a,3gp,3g2,mj2";
  sampleRateHz: 48_000;
  channels: 2;
  bitrateBps: number;
  durationSeconds: number;
  fastStart: true;
  completeDecode: true;
  ffmpegVersion: string;
};

export class FfmpegAudioDeliveryEncoder {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(
    ffmpegPath = process.env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath = process.env.FFPROBE_PATH?.trim() || "ffprobe",
  ) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async encode(
    inputPath: string,
    outputPath: string,
    job: AudioDeliveryJob | EpisodeProgramDeliveryJob,
  ): Promise<EncodedAudioDelivery> {
    await run(this.ffmpegPath, [
      "-hide_banner", "-nostdin", "-y", "-i", inputPath,
      "-map", "0:a:0", "-vn", "-c:a", "aac", "-profile:a", "aac_low",
      "-ar", String(job.target.sampleRateHz), "-ac", String(job.target.channels),
      "-b:a", String(job.target.bitrateBps), "-movflags", "+faststart",
      "-map_metadata", "-1", outputPath,
    ], "audio-delivery-encode-failed");
    return this.inspect(outputPath);
  }

  async inspect(outputPath: string): Promise<EncodedAudioDelivery> {
    const outputStat = await stat(outputPath).catch(() => null);
    if (!outputStat?.isFile() || outputStat.size <= 0) {
      throw new ProxyTranscodeError("audio-delivery-output-empty", "The encoded delivery artifact is empty.");
    }
    const probeText = await run(this.ffprobePath, [
      "-v", "error", "-show_entries",
      "format=format_name,duration,bit_rate:stream=index,codec_type,codec_name,profile,sample_rate,channels,bit_rate,duration",
      "-of", "json", outputPath,
    ], "audio-delivery-probe-failed");
    let probe: Probe;
    try { probe = JSON.parse(probeText.stdout) as Probe; } catch {
      throw new ProxyTranscodeError("audio-delivery-probe-invalid", "FFprobe returned malformed delivery metadata.");
    }
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    const format = probe.format || {};
    const durationSeconds = finite(audio?.duration) || finite(format.duration);
    const bitrateBps = finite(audio?.bit_rate) || finite(format.bit_rate);
    const formatName = String(format.format_name || "");
    if (
      !audio || audio.codec_name !== "aac" || audio.profile !== "LC"
      || Number(audio.sample_rate) !== 48_000 || Number(audio.channels) !== 2
      || !formatName.split(",").includes("mov") || !durationSeconds || bitrateBps < 96_000 || bitrateBps > 160_000
    ) {
      throw new ProxyTranscodeError("audio-delivery-technical-invalid", "The encoded artifact does not match the AAC-LC stereo delivery recipe.");
    }
    const atomOrder = await topLevelAtomOrder(outputPath, outputStat.size);
    const moov = atomOrder.indexOf("moov");
    const mdat = atomOrder.indexOf("mdat");
    if (moov < 0 || mdat < 0 || moov > mdat) {
      throw new ProxyTranscodeError("audio-delivery-faststart-invalid", "The encoded MP4 does not place its movie metadata before media bytes.");
    }
    await run(this.ffmpegPath, ["-hide_banner", "-nostdin", "-v", "error", "-i", outputPath, "-map", "0:a:0", "-f", "null", "-"], "audio-delivery-decode-failed");
    const version = await run(this.ffmpegPath, ["-version"], "audio-delivery-version-failed");
    const ffmpegVersion = version.stdout.split(/\r?\n/, 1)[0]?.trim();
    if (!ffmpegVersion) throw new ProxyTranscodeError("audio-delivery-version-invalid", "FFmpeg did not report its encoder version.");
    return {
      outputPath,
      sha256: await sha256File(outputPath),
      sizeBytes: outputStat.size,
      contentType: "audio/mp4",
      codec: "aac",
      codecProfile: "LC",
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      sampleRateHz: 48_000,
      channels: 2,
      bitrateBps,
      durationSeconds,
      fastStart: true,
      completeDecode: true,
      ffmpegVersion,
    };
  }
}

async function topLevelAtomOrder(filePath: string, fileSize: number) {
  const handle = await open(filePath, "r");
  const order: string[] = [];
  try {
    let offset = 0;
    while (offset + 8 <= fileSize && order.length < 128) {
      const header = Buffer.alloc(16);
      const read = await handle.read(header, 0, 16, offset);
      if (read.bytesRead < 8) break;
      let atomSize = header.readUInt32BE(0);
      const atomType = header.subarray(4, 8).toString("ascii");
      let headerSize = 8;
      if (atomSize === 1) {
        if (read.bytesRead < 16) throw new ProxyTranscodeError("audio-delivery-container-invalid", "The MP4 extended atom header is incomplete.");
        const extended = header.readBigUInt64BE(8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProxyTranscodeError("audio-delivery-container-invalid", "The MP4 atom is too large to verify safely.");
        atomSize = Number(extended);
        headerSize = 16;
      } else if (atomSize === 0) {
        atomSize = fileSize - offset;
      }
      if (atomSize < headerSize || offset + atomSize > fileSize) {
        throw new ProxyTranscodeError("audio-delivery-container-invalid", "The MP4 top-level atom table is malformed.");
      }
      order.push(atomType);
      offset += atomSize;
    }
  } finally {
    await handle.close();
  }
  return order;
}

function finite(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function run(command: string, args: string[], code: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-32_000); });
    child.once("error", (error) => reject(new ProxyTranscodeError(code, `Could not start ${command}: ${error.message}`, true)));
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0) resolve({ stdout, stderr });
      else reject(new ProxyTranscodeError(code, `${command} exited ${exitCode ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr.trim() || "no diagnostic"}`));
    });
  });
}
