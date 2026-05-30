import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type ViteDevServer } from "vite";

type MigrationStatusSource = {
  path: string;
  updatedAt: string | null;
  payload: unknown;
};

type MigrationHealthPayload = {
  projectId: string;
  collectionId: string;
  migrationStatus: MigrationStatusSource | null;
  watchStatus: MigrationStatusSource | null;
  updatedAt: string | null;
};

const DEFAULT_STATUS_PROJECT_ID = "episode-004";
const DEFAULT_STATUS_COLLECTION_ID = "homer-insta360";
const STATUS_ROUTE = "/api/studio-cut/media-vault/migration-health";

function sanitizePathSegment(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : fallback;
}

function coerceString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim();
  }

  return null;
}

function toUpdatedAt(payload: unknown): string | null {
  const anyPayload = payload as {
    createdAt?: unknown;
    runUpdatedAt?: unknown;
    updatedAt?: unknown;
  };
  return (
    coerceString(anyPayload.createdAt) ||
    coerceString(anyPayload.runUpdatedAt) ||
    coerceString(anyPayload.updatedAt)
  );
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readMostRecentStatusFile(
  filePath: string,
): Promise<MigrationStatusSource | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return null;
    }

    const payload = await readJsonFile(filePath);
    if (payload === null) {
      return null;
    }

    return {
      path: filePath,
      updatedAt: toUpdatedAt(payload) || stats.mtime.toISOString(),
      payload,
    };
  } catch {
    return null;
  }
}

async function readMostRecentStatusFileFromDirectory(
  directoryPath: string,
  filePrefix?: string,
): Promise<MigrationStatusSource | null> {
  try {
    const files = await readdir(directoryPath);
    let latestFile: { name: string; mtimeMs: number } | null = null;

    for (const name of files) {
      if (!name.endsWith(".json")) {
        continue;
      }
      if (filePrefix && !name.startsWith(filePrefix)) {
        continue;
      }

      const candidatePath = path.join(directoryPath, name);
      const candidateStats = await stat(candidatePath);
      if (!candidateStats.isFile()) {
        continue;
      }
      if (!latestFile || candidateStats.mtimeMs > latestFile.mtimeMs) {
        latestFile = { name, mtimeMs: candidateStats.mtimeMs };
      }
    }

    if (!latestFile) {
      return null;
    }

    return await readMostRecentStatusFile(path.join(directoryPath, latestFile.name));
  } catch {
    return null;
  }
}

function createStatusPayload(
  projectId: string,
  collectionId: string,
  migrationStatus: MigrationStatusSource | null,
  watchStatus: MigrationStatusSource | null,
): MigrationHealthPayload {
  const updatedAt = migrationStatus?.updatedAt || watchStatus?.updatedAt || null;

  return {
    projectId,
    collectionId,
    migrationStatus,
    watchStatus,
    updatedAt,
  };
}

function newestStatusSource(
  left: MigrationStatusSource | null,
  right: MigrationStatusSource | null,
): MigrationStatusSource | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const leftTime = new Date(left.updatedAt || 0).getTime();
  const rightTime = new Date(right.updatedAt || 0).getTime();
  return rightTime >= leftTime ? right : left;
}

function writeJsonResponse(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default defineConfig({
  server: {
    port: 5175,
  },
  plugins: [
    {
      name: "studio-cut-media-vault-status-endpoint",
      configureServer(server: ViteDevServer) {
        server.middlewares.use(
          async (
            req: IncomingMessage,
            res: ServerResponse,
            next: () => void,
          ) => {
            if (!req.url || !req.url.startsWith(STATUS_ROUTE)) {
              next();
              return;
            }

            const parsed = new URL(req.url, "http://localhost");
            const projectId = sanitizePathSegment(
              parsed.searchParams.get("project-id"),
              DEFAULT_STATUS_PROJECT_ID,
            );
            const collectionId = sanitizePathSegment(
              parsed.searchParams.get("collection-id"),
              DEFAULT_STATUS_COLLECTION_ID,
            );

            const downloadDir = path.join(
              os.homedir(),
              "Movies",
              "StudioCut",
              projectId,
              "insta360-downloads",
            );
            const migrationStatusFileCandidates = [
              path.join(
                os.homedir(),
                "Movies",
                "StudioCut",
                projectId,
                "insta360-downloads",
                ".studio-cut-media-vault-status",
                "migration-status.json",
              ),
              path.join(
                process.cwd(),
                `studio-cut-migration-report-${projectId}-${collectionId}.json`,
              ),
            ];

            let migrationStatus: MigrationStatusSource | null = null;
            for (const candidate of migrationStatusFileCandidates) {
              const next = await readMostRecentStatusFile(candidate);
              if (next !== null) {
                migrationStatus = next;
                break;
              }
            }

            const watchStatus = await readMostRecentStatusFileFromDirectory(
              path.join(downloadDir, ".studio-cut-insta360-watch-status"),
              "download-all-watch-",
            );

            const drainWatchStatus = await readMostRecentStatusFileFromDirectory(
              path.join(downloadDir, ".studio-cut-drain-watch-status"),
              "drain-folder-watch-",
            );

            const latestWatchStatus = newestStatusSource(drainWatchStatus, watchStatus);

            if (!migrationStatus && !latestWatchStatus) {
              writeJsonResponse(
                res,
                200,
                createStatusPayload(projectId, collectionId, null, null),
              );
              return;
            }

            const payload = createStatusPayload(
              projectId,
              collectionId,
              migrationStatus,
              latestWatchStatus,
            );
            writeJsonResponse(res, 200, payload);
          },
        );
      },
    },
  ],
  preview: { port: 4175 },
});
