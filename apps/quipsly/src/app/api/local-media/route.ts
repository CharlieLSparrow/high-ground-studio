import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ROOTS = [
  "/Volumes/My Passport/Quipsly Media Vault",
  "/Users/wall-e/Library/Application Support/Quipsly/MediaVault",
];

const CONTENT_TYPES = new Map([
  [".aac", "audio/aac"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".m4a", "audio/mp4"],
  [".m4v", "video/x-m4v"],
  [".mov", "video/quicktime"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
]);

function notFound() {
  return new Response("Not found", { status: 404 });
}

function configuredRoots() {
  const configured = process.env.QUIPSLY_LOCAL_MEDIA_ROOTS?.split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ROOTS;
}

async function authorizedPath(request: Request) {
  if (process.env.NODE_ENV === "production") return null;
  const session = await auth();
  if (!session?.user?.email) return null;
  const requestedPath = new URL(request.url).searchParams.get("path");
  if (!requestedPath || !path.isAbsolute(requestedPath)) return null;
  const extension = path.extname(requestedPath).toLowerCase();
  if (!CONTENT_TYPES.has(extension)) return null;

  const resolvedCandidate = await realpath(requestedPath).catch(() => null);
  if (!resolvedCandidate) return null;
  for (const root of configuredRoots()) {
    const resolvedRoot = await realpath(root).catch(() => null);
    if (!resolvedRoot) continue;
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return { path: resolvedCandidate, extension };
    }
  }
  return null;
}

async function mediaResponse(request: Request, headOnly = false) {
  const authorized = await authorizedPath(request);
  if (!authorized) return notFound();
  const details = await stat(authorized.path).catch(() => null);
  if (!details?.isFile()) return notFound();

  const baseHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": CONTENT_TYPES.get(authorized.extension) ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new Response("Invalid range", { status: 416 });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : details.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= details.size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${details.size}` },
      });
    }
    baseHeaders.set("Content-Length", String(end - start + 1));
    baseHeaders.set("Content-Range", `bytes ${start}-${end}/${details.size}`);
    const body = headOnly
      ? null
      : (Readable.toWeb(createReadStream(authorized.path, { start, end })) as ReadableStream);
    return new Response(body, { status: 206, headers: baseHeaders });
  }

  baseHeaders.set("Content-Length", String(details.size));
  const body = headOnly
    ? null
    : (Readable.toWeb(createReadStream(authorized.path)) as ReadableStream);
  return new Response(body, { status: 200, headers: baseHeaders });
}

export async function GET(request: Request) {
  return mediaResponse(request);
}

export async function HEAD(request: Request) {
  return mediaResponse(request, true);
}
