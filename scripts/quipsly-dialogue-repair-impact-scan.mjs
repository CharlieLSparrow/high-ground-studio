#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { newDialogueRepairCandidate } from "../packages/quipsly-media-processing/src/audio-dialogue-repair.ts";

const FILTER = "adeclick=window=55:overlap=75:arorder=2:threshold=2:burst=2:method=add";
const DETECTOR_ID = "adeclick_impact_scan";
const DETECTOR_VERSION = "ffmpeg-adeclick-impact-v1";
const SAMPLE_RATE = 48_000;
const WINDOW_FRAMES = 480;

const options = parseArguments(process.argv.slice(2));
const sourcePath = path.resolve(options.source);
const outputRoot = path.resolve(options.output);
await mkdir(outputRoot, { recursive: true, mode: 0o700 });

const [sourceStat, sourceSha256, probe] = await Promise.all([
  stat(sourcePath),
  sha256(sourcePath),
  probeAudio(sourcePath),
]);
if (!sourceStat.isFile() || sourceStat.size <= 0) throw new Error("Dialogue repair scan source must be a non-empty file.");
if (probe.sampleRateHz !== SAMPLE_RATE) throw new Error("Dialogue repair retained scans currently require a 48 kHz source.");
const scan = await scanTreatmentImpact(sourcePath, probe.channels);

const selected = selectSeparatedWindows(scan.windows, options.maximumCandidates, options.minimumSeparationSeconds);
const source = {
  assetId: options.assetId || `asset_scan_${sourceSha256.slice(0, 16)}`,
  provider: "local",
  locator: sourcePath,
  generation: `sha256:${sourceSha256}`,
  sha256: sourceSha256,
  sizeBytes: sourceStat.size,
  contentType: probe.contentType,
};
const createdAt = new Date().toISOString();
const maximumRms = Math.max(...selected.map((window) => window.rms), Number.EPSILON);
const candidates = [];
const rankedWindows = selected.map((window, index) => ({ ...window, impactRank: index + 1 })).sort((left, right) => left.startSeconds - right.startSeconds);
for (const window of rankedWindows) {
  const candidateId = `candidate_impact_${Math.round(window.startSeconds * 1_000_000).toString().padStart(9, "0")}`;
  const candidate = newDialogueRepairCandidate({
    candidateId,
    createdAt,
    createdByEmail: options.actorEmail,
    label: "mouth-click",
    source,
    range: {
      startSeconds: window.startSeconds,
      endSeconds: Math.min(probe.durationSeconds, window.startSeconds + 0.01),
      auditionPreRollSeconds: 0.6,
      auditionPostRollSeconds: 0.6,
      sourceDurationSeconds: probe.durationSeconds,
    },
    origin: {
      kind: "detector-suggestion",
      detectorId: DETECTOR_ID,
      detectorVersion: DETECTOR_VERSION,
      score: round(window.rms / maximumRms, 6),
      qualificationStatus: "unqualified",
      evidence: { impactRms: round(window.rms, 9), impactPeak: round(window.peak, 9), windowMilliseconds: 10 },
    },
    context: { speakerId: null, transcriptWordAnchors: [] },
  });
  const stem = `${String(window.impactRank).padStart(2, "0")}-${window.startSeconds.toFixed(3)}s`;
  const contextStart = Math.max(0, candidate.range.startSeconds - candidate.range.auditionPreRollSeconds);
  const contextEnd = Math.min(probe.durationSeconds, candidate.range.endSeconds + candidate.range.auditionPostRollSeconds);
  const clipPath = path.join(outputRoot, `${stem}-source-context.wav`);
  const spectrumPath = path.join(outputRoot, `${stem}-source-spectrum.png`);
  await renderReviewContext(sourcePath, clipPath, spectrumPath, contextStart, contextEnd - contextStart);
  candidates.push({
    rankByTreatmentImpact: window.impactRank,
    candidate,
    reviewArtifacts: {
      sourceContextWav: clipPath,
      sourceSpectrumPng: spectrumPath,
      contextStartSeconds: round(contextStart, 6),
      contextEndSeconds: round(contextEnd, 6),
      treatmentPreviewCreated: false,
    },
  });
}

const manifest = {
  schema: "quipsly-dialogue-repair-impact-scan-v1",
  createdAt,
  source,
  probe,
  detector: {
    id: DETECTOR_ID,
    version: DETECTOR_VERSION,
    filter: FILTER,
    windowMilliseconds: 10,
    completeSourceDecode: true,
    completeTreatmentDecode: true,
    scoreMeaning: "relative RMS change between source and full-track filter output; not probability and not a listening judgment",
    qualificationStatus: "unqualified",
  },
  selection: {
    maximumCandidates: options.maximumCandidates,
    minimumSeparationSeconds: options.minimumSeparationSeconds,
    scannedWindowCount: scan.windows.length,
    selectedCandidateCount: candidates.length,
  },
  candidates,
  boundaries: {
    originalSourceBytesPreserved: (await sha256(sourcePath)) === sourceSha256,
    candidatesAreListeningTriageOnly: true,
    detectorIsNotQualified: true,
    noTreatmentPreviewCreated: true,
    noReviewReceiptCreated: true,
    noPromotionOrDeliveryAuthorized: true,
  },
};
const manifestPath = path.join(outputRoot, "dialogue-repair-impact-scan-v1.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ ok: true, manifestPath, candidateCount: candidates.length, sourceSha256 }, null, 2)}\n`);

function parseArguments(args) {
  if (args[0] === "--") args = args.slice(1);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error("Use --source, --output, --actor-email, and optional --asset-id, --maximum-candidates, --minimum-separation-seconds.");
    values.set(name.slice(2), value);
  }
  const source = values.get("source");
  const output = values.get("output");
  const actorEmail = values.get("actor-email")?.trim().toLowerCase();
  const maximumCandidates = Number(values.get("maximum-candidates") || 12);
  const minimumSeparationSeconds = Number(values.get("minimum-separation-seconds") || 0.08);
  if (!source || !output || !actorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail)) throw new Error("A source, output directory, and valid actor email are required.");
  if (!Number.isInteger(maximumCandidates) || maximumCandidates < 1 || maximumCandidates > 100) throw new Error("maximum-candidates must be an integer from 1 through 100.");
  if (!Number.isFinite(minimumSeparationSeconds) || minimumSeparationSeconds < 0.01 || minimumSeparationSeconds > 10) throw new Error("minimum-separation-seconds must be from 0.01 through 10.");
  return { source, output, actorEmail, assetId: values.get("asset-id") || null, maximumCandidates, minimumSeparationSeconds };
}

async function scanTreatmentImpact(inputPath, channels) {
  const source = rawDecode(inputPath, null);
  const treated = rawDecode(inputPath, FILTER);
  const sourceChunks = floatChunks(source.child.stdout)[Symbol.asyncIterator]();
  const treatedChunks = floatChunks(treated.child.stdout)[Symbol.asyncIterator]();
  let sourceChunk = await sourceChunks.next();
  let treatedChunk = await treatedChunks.next();
  let sourceOffset = 0;
  let treatedOffset = 0;
  let frame = 0;
  let binStartFrame = 0;
  let sumSquares = 0;
  let peak = 0;
  let samplesInBin = 0;
  const windows = [];
  while (!sourceChunk.done && !treatedChunk.done) {
    const available = Math.min(sourceChunk.value.length - sourceOffset, treatedChunk.value.length - treatedOffset);
    for (let offset = 0; offset < available; offset += 1) {
      const difference = Math.abs(sourceChunk.value[sourceOffset + offset] - treatedChunk.value[treatedOffset + offset]);
      sumSquares += difference * difference;
      peak = Math.max(peak, difference);
      samplesInBin += 1;
      if (samplesInBin === WINDOW_FRAMES * channels) {
        windows.push({ startSeconds: round(binStartFrame / SAMPLE_RATE, 6), rms: Math.sqrt(sumSquares / samplesInBin), peak });
        frame += WINDOW_FRAMES;
        binStartFrame = frame;
        sumSquares = 0;
        peak = 0;
        samplesInBin = 0;
      }
    }
    sourceOffset += available;
    treatedOffset += available;
    if (sourceOffset === sourceChunk.value.length) { sourceChunk = await sourceChunks.next(); sourceOffset = 0; }
    if (treatedOffset === treatedChunk.value.length) { treatedChunk = await treatedChunks.next(); treatedOffset = 0; }
  }
  if (sourceChunk.done !== treatedChunk.done) throw new Error("Source and treatment impact decodes did not contain the same number of samples.");
  await Promise.all([source.completed, treated.completed]);
  if (samplesInBin > 0) windows.push({ startSeconds: round(binStartFrame / SAMPLE_RATE, 6), rms: Math.sqrt(sumSquares / samplesInBin), peak });
  return { windows };
}

function rawDecode(inputPath, filter) {
  const args = ["-v", "error", "-nostdin", "-i", inputPath, "-map", "0:a:0"];
  if (filter) args.push("-filter:a", filter);
  args.push("-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1");
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg impact decode failed with ${code}: ${stderr}`)));
  });
  return { child, completed };
}

async function* floatChunks(stream) {
  let remainder = Buffer.alloc(0);
  for await (const chunk of stream) {
    const bytes = Buffer.concat([remainder, chunk]);
    const completeBytes = bytes.length - (bytes.length % 4);
    if (completeBytes > 0) {
      const copy = Buffer.from(bytes.subarray(0, completeBytes));
      yield new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
    }
    remainder = Buffer.from(bytes.subarray(completeBytes));
  }
  if (remainder.length !== 0) throw new Error("FFmpeg returned a partial float sample.");
}

function selectSeparatedWindows(windows, maximum, separation) {
  const selected = [];
  for (const window of [...windows].sort((left, right) => right.rms - left.rms)) {
    if (window.rms <= 1e-12) continue;
    if (selected.every((current) => Math.abs(current.startSeconds - window.startSeconds) >= separation)) selected.push(window);
    if (selected.length === maximum) break;
  }
  return selected;
}

async function renderReviewContext(sourcePath, clipPath, spectrumPath, startSeconds, durationSeconds) {
  await run("ffmpeg", ["-v", "error", "-nostdin", "-n", "-ss", String(startSeconds), "-i", sourcePath, "-t", String(durationSeconds), "-map", "0:a:0", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s24le", clipPath]);
  await run("ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", clipPath, "-lavfi", "showspectrumpic=s=1280x360:legend=1:color=rainbow:scale=log:fscale=log:start=60:stop=20000", "-frames:v", "1", spectrumPath]);
}

async function probeAudio(inputPath) {
  const result = await capture("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels:format=duration,format_name", "-of", "json", inputPath]);
  const parsed = JSON.parse(result);
  const stream = parsed.streams?.[0];
  const format = parsed.format;
  const durationSeconds = round(Number(format?.duration), 6);
  const sampleRateHz = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(sampleRateHz) || !Number.isInteger(channels) || channels <= 0) throw new Error("FFprobe did not return a complete audio identity.");
  const container = String(format.format_name || "");
  if (!container.split(",").includes("wav")) throw new Error("Dialogue repair retained scans currently require a WAV source so the source content type remains exact.");
  return { durationSeconds, sampleRateHz, channels, codec: String(stream.codec_name || ""), container, contentType: "audio/wav" };
}

function capture(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${executable} failed with ${code}: ${stderr}`)));
  });
}

function run(executable, args) { return capture(executable, args).then(() => undefined); }
function sha256(filePath) { return new Promise((resolve, reject) => { const hash = createHash("sha256"); const stream = createReadStream(filePath); stream.on("data", (chunk) => hash.update(chunk)); stream.once("error", reject); stream.once("end", () => resolve(hash.digest("hex"))); }); }
function round(value, digits) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
