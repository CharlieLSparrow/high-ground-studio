import { NextResponse, type NextRequest } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import {
  getStudioContentProject,
  listStudioContentProjects,
  safeContentStudioProjectInput,
  upsertStudioContentProject,
} from "@/lib/server/studio-content-projects";
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
      response: jsonError("Sign in to use Content Studio projects.", 401),
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

function projectServiceUnavailable(error: unknown) {
  console.error("Content Studio project request failed.", error);

  return jsonError(
    "Content Studio project persistence is not available in this environment.",
    503,
  );
}

function assertProjectPersistenceConfigured() {
  if (getStudioDatabaseUrl()) {
    return null;
  }

  return jsonError(
    "Content Studio projects need a configured Studio database.",
    503,
  );
}

export async function GET(request: NextRequest) {
  const unavailableResponse = assertProjectPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getContentStudioOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  try {
    const projectId = request.nextUrl.searchParams.get("id")?.trim() ?? "";

    if (projectId) {
      const project = await getStudioContentProject({
        ownerEmail: owner.ownerEmail,
        projectId,
      });

      return NextResponse.json({ ok: true, project });
    }

    const projects = await listStudioContentProjects({
      ownerEmail: owner.ownerEmail,
    });

    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    return projectServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailableResponse = assertProjectPersistenceConfigured();

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
    return jsonError("Project request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          project?: unknown;
          description?: unknown;
        })
      : null;
  const parsed = safeContentStudioProjectInput(requestBody?.project);

  if (!parsed.project) {
    return jsonError(parsed.errors.join(" "), 400);
  }

  try {
    const project = await upsertStudioContentProject({
      ownerEmail: owner.ownerEmail,
      project: parsed.project,
      description:
        typeof requestBody?.description === "string"
          ? requestBody.description
          : null,
    });

    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return projectServiceUnavailable(error);
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
