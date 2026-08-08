import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";
import {
  readCurrentLocalExecutorIdentity,
  readLocalExecutorTarget,
} from "@/lib/server/local-executor-storage";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", { status: 404 });
}

function byteRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true as const };
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      return { invalid: true as const };
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { invalid: true as const };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function derivativeResponse(
  request: Request,
  id: string,
  headOnly = false,
) {
  const session = await getQuipslySessionFromRequest(request);
  const email = normalizeAccessEmail(
    session?.user.primaryEmail || session?.user.email,
  );
  if (!session?.user.id || !email) return notFound();
  const prisma = getPrismaClient();
  const derivative = await prisma.studioMediaDerivative.findUnique({
    where: { id },
    include: { project: { select: { slug: true } } },
  });
  if (!derivative || derivative.status !== "ready") return notFound();
  const access = await resolveStudioProjectAccess({
    projectSlug: derivative.project.slug,
    email,
    action: "read",
    prisma,
  });
  if (!access.allowed || access.projectId !== derivative.projectId)
    return notFound();
  if (
    derivative.storageProvider !== "local" ||
    process.env.NODE_ENV === "production"
  )
    return notFound();
  if (
    Boolean(derivative.custodianNodeId) !== Boolean(derivative.storageScopeId)
  )
    return notFound();
  if (derivative.custodianNodeId && derivative.storageScopeId) {
    const [executor, currentExecutor] = await Promise.all([
      readLocalExecutorTarget(prisma, derivative.custodianNodeId),
      readCurrentLocalExecutorIdentity(),
    ]);
    if (
      !executor ||
      executor.storageScopeId !== derivative.storageScopeId ||
      !currentExecutor ||
      currentExecutor.nodeId !== derivative.custodianNodeId ||
      currentExecutor.storageScopeId !== derivative.storageScopeId
    )
      return notFound();
  }

  const candidate = await resolveAllowedLocalStudioMediaPath(
    derivative.locator,
    ["QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT", "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT"],
  );
  if (!candidate) return notFound();
  const details = await stat(candidate).catch(() => null);
  if (!details?.isFile() || details.size !== Number(derivative.sizeBytes))
    return notFound();

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": derivative.mimeType,
    ETag: `"sha256-${derivative.contentSha256}"`,
    "X-Content-Type-Options": "nosniff",
  });
  const range = byteRange(request.headers.get("range"), details.size);
  if (range && "invalid" in range) {
    headers.set("Content-Range", `bytes */${details.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${details.size}`,
    );
    const body = headOnly
      ? null
      : (Readable.toWeb(createReadStream(candidate, range)) as ReadableStream);
    return new Response(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(details.size));
  const body = headOnly
    ? null
    : (Readable.toWeb(createReadStream(candidate)) as ReadableStream);
  return new Response(body, { status: 200, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return derivativeResponse(request, id);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return derivativeResponse(request, id, true);
}
