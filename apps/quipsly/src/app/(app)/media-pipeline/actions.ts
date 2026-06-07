"use server";

type MediaFile = {
  name: string;
  sourcePath: string;
  type: "video" | "photo" | "audio" | "unknown";
  sizeMb: string;
  proposedDestination: string;
  status?: string;
};

const LOCAL_ENGINE_HANDOFF = {
  macApp: "Quipsly Mac",
  localEngine: "apps/local-engine",
  recommendedRoute: "/editor",
  supportedWorkflow:
    "Choose files in Quipsly Mac, probe/proxy/upload through local-engine, then attach registered assets to a Nest or episode in the web editor.",
};

function unsupportedLocalFilesystemMessage() {
  return [
    "The Nest web app no longer scans arbitrary local folders.",
    "That work belongs to Quipsly Mac + local-engine so imports can use native file pickers, local ffmpeg, local cache, upload retries, and clear user consent.",
    "Open Quipsly Mac, use Import to Episode or Local Files, then return here after the assets are registered.",
  ].join(" ");
}

export async function scanDirectory(sourcePath = "", destPath = "") {
  return {
    success: false,
    disabled: true,
    files: [] as MediaFile[],
    sourcePath,
    destPath,
    handoff: LOCAL_ENGINE_HANDOFF,
    error: unsupportedLocalFilesystemMessage(),
  };
}

export async function organizeMedia(files: MediaFile[], dryRun = true) {
  return {
    success: false,
    disabled: true,
    results: files.map((file) => ({
      ...file,
      status: "held",
      error: "Use Quipsly Mac/local-engine for local filesystem organization.",
    })),
    dryRun,
    handoff: LOCAL_ENGINE_HANDOFF,
    error: unsupportedLocalFilesystemMessage(),
  };
}
