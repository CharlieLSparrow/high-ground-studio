import { NextResponse, type NextRequest } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import {
  createStudioContentWorkspaceSnapshot,
  getLatestStudioContentWorkspaceSnapshot,
  getStudioContentWorkspaceSnapshot,
  listStudioContentWorkspaceSnapshots,
  safeContentStudioWorkspaceInput,
} from "@/lib/server/studio-content-workspace-snapshots";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getContentStudioOwnerEmail() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to use Content Studio snapshots.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot access Content Studio.", 403),
    };
  }

  const ownerEmail =
    access.session?.user?.primaryEmail || access.session?.user?.email || "";

  if (!ownerEmail) {
    return {
      ok: false as const,
      response: jsonError("Studio session is missing an owner email.", 400),
    };
  }

  return {
    ok: true as const,
    ownerEmail,
  };
}

function snapshotServiceUnavailable(error: unknown) {
  console.error("Content Studio snapshot request failed.", error);

  return jsonError(
    "Content Studio snapshots are not available in this environment.",
    503,
  );
}

function assertSnapshotPersistenceConfigured() {
  if (getStudioDatabaseUrl()) {
    return null;
  }

  return jsonError(
    "Content Studio snapshots need a configured Studio database.",
    503,
  );
}

export async function GET(request: NextRequest) {
  const unavailableResponse = assertSnapshotPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getContentStudioOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  try {
    const snapshotId = request.nextUrl.searchParams.get("id")?.trim() ?? "";

    if (snapshotId) {
      const snapshot = await getStudioContentWorkspaceSnapshot({
        ownerEmail: owner.ownerEmail,
        snapshotId,
      });

      return NextResponse.json({ ok: true, snapshot });
    }

    if (request.nextUrl.searchParams.get("latest") === "1") {
      const snapshot = await getLatestStudioContentWorkspaceSnapshot({
        ownerEmail: owner.ownerEmail,
      });

      return NextResponse.json({ ok: true, snapshot });
    }

    const snapshots = await listStudioContentWorkspaceSnapshots({
      ownerEmail: owner.ownerEmail,
    });

    return NextResponse.json({ ok: true, snapshots });
  } catch (error) {
    return snapshotServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailableResponse = assertSnapshotPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getContentStudioOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Snapshot request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          workspace?: unknown;
          packet?: unknown;
          title?: unknown;
          description?: unknown;
        })
      : null;
  const workspaceInput = requestBody?.workspace ?? requestBody?.packet;
  const parsed = safeContentStudioWorkspaceInput(workspaceInput);

  if (!parsed.workspace) {
    return jsonError(
      `Content Studio workspace did not match the expected packet shape. ${
        "errors" in parsed ? parsed.errors.join(" ") : ""
      }`.trim(),
      400,
    );
  }

  try {
    const snapshot = await createStudioContentWorkspaceSnapshot({
      ownerEmail: owner.ownerEmail,
      workspace: parsed.workspace,
      title:
        typeof requestBody?.title === "string" ? requestBody.title : undefined,
      description:
        typeof requestBody?.description === "string"
          ? requestBody.description
          : null,
    });

    return NextResponse.json(
      {
        ok: true,
        snapshot,
        warnings: parsed.warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    return snapshotServiceUnavailable(error);
  }
}
