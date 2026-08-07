import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { arch, platform } from "node:os";
import { promisify } from "node:util";

import {
  evaluateSpatialExecutorReadiness,
  type SpatialExecutorProbe,
  type SpatialExecutorReadiness,
} from "@high-ground/quipsly-media-processing";

const executeFile = promisify(execFile);
const CACHE_MS = 30_000;
let cached: { expiresAt: number; report: SpatialRenderReadinessReport } | null = null;

export type SpatialRenderReadinessReport = {
  checkedAt: string;
  probe: SpatialExecutorProbe;
  readiness: SpatialExecutorReadiness;
  executorContract: {
    stitch: "insta360-mediasdk-v3";
    reframe: "ffmpeg-v360-frame-commanded-v1";
    automaticSdkPlatforms: ["linux-x64", "windows-x64"];
  };
};

export async function readSpatialRenderReadiness(input: { fresh?: boolean } = {}): Promise<SpatialRenderReadinessReport> {
  const now = Date.now();
  if (!input.fresh && cached && cached.expiresAt > now) return cached.report;
  const ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg";
  const adapterPath = process.env.QUIPSLY_INSTA360_MEDIASDK_ADAPTER?.trim() || "";
  const licensePath = process.env.QUIPSLY_INSTA360_MEDIASDK_LICENSE?.trim() || "";
  const modelsPath = process.env.QUIPSLY_INSTA360_MEDIASDK_MODELS?.trim() || "";
  const studioPath = process.env.QUIPSLY_INSTA360_STUDIO_APP?.trim() || "/Applications/Insta360 Studio.app";

  const [ffmpegVersion, v360Help, adapterVersion, studioVersion, licenseConfigured, modelsConfigured] = await Promise.all([
    commandFirstLine(ffmpegPath, ["-version"]),
    commandText(ffmpegPath, ["-hide_banner", "-h", "filter=v360"]),
    adapterPath ? commandFirstLine(adapterPath, ["--version"]) : Promise.resolve(null),
    platform() === "darwin" ? macAppVersion(studioPath) : Promise.resolve(null),
    exists(licensePath),
    exists(modelsPath),
  ]);
  const runtimeViewCommands = ["yaw", "pitch", "roll", "h_fov"].every((option) => new RegExp(`^\\s*${option}\\s+.*T\\.`, "m").test(v360Help ?? ""));
  const currentPlatform = platform();
  const probe: SpatialExecutorProbe = {
    platform: currentPlatform === "darwin" || currentPlatform === "linux" || currentPlatform === "win32" ? currentPlatform : "other",
    architecture: arch(),
    insta360Studio: { available: Boolean(studioVersion), version: studioVersion },
    mediaSdk: { available: Boolean(adapterVersion), version: adapterVersion, licenseConfigured, modelsConfigured },
    ffmpeg: { available: Boolean(ffmpegVersion), version: ffmpegVersion, v360Available: Boolean(v360Help?.includes("Filter v360")), runtimeViewCommands },
  };
  const report: SpatialRenderReadinessReport = {
    checkedAt: new Date(now).toISOString(),
    probe,
    readiness: evaluateSpatialExecutorReadiness(probe),
    executorContract: { stitch: "insta360-mediasdk-v3", reframe: "ffmpeg-v360-frame-commanded-v1", automaticSdkPlatforms: ["linux-x64", "windows-x64"] },
  };
  cached = { expiresAt: now + CACHE_MS, report };
  return report;
}

async function macAppVersion(appPath: string) {
  if (!await exists(appPath)) return null;
  const plist = `${appPath}/Contents/Info.plist`;
  return commandFirstLine("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", plist]);
}

async function exists(value: string) {
  if (!value) return false;
  return access(value).then(() => true, () => false);
}

async function commandFirstLine(command: string, args: string[]) {
  const value = await commandText(command, args);
  return value?.split(/\r?\n/, 1)[0]?.trim() || null;
}

async function commandText(command: string, args: string[]) {
  try {
    const result = await executeFile(command, args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 10_000 });
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  } catch {
    return null;
  }
}
