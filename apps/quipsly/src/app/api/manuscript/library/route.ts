import { NextResponse, type NextRequest } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  createStudioManuscript,
  listStudioManuscripts,
} from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getLibraryOwnerEmail() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to use the manuscript library.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot access the manuscript library.", 403),
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

function libraryServiceUnavailable(error: unknown) {
  console.error("Studio manuscript library request failed.", error);

  return jsonError(
    "The Studio manuscript library is not available in this environment.",
    503,
  );
}

function assertLibraryPersistenceConfigured() {
  if (getStudioDatabaseUrl()) {
    return null;
  }

  return jsonError(
    "The Studio manuscript library needs a configured Studio database.",
    503,
  );
}

export async function GET() {
  const unavailableResponse = assertLibraryPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getLibraryOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  try {
    const manuscripts = await listStudioManuscripts({
      ownerEmail: owner.ownerEmail,
    });

    return NextResponse.json({ ok: true, manuscripts });
  } catch (error) {
    return libraryServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailableResponse = assertLibraryPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getLibraryOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Manuscript library request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          title?: unknown;
          description?: unknown;
          sourceFileName?: unknown;
          kind?: unknown;
        })
      : null;

  if (typeof requestBody?.title !== "string" || !requestBody.title.trim()) {
    return jsonError("Manuscript title is required.", 400);
  }

  try {
    const manuscript = await createStudioManuscript({
      ownerEmail: owner.ownerEmail,
      title: requestBody.title,
      description:
        typeof requestBody.description === "string"
          ? requestBody.description
          : null,
      sourceFileName:
        typeof requestBody.sourceFileName === "string"
          ? requestBody.sourceFileName
          : null,
      kind: requestBody.kind === "SYNTHETIC" ? "SYNTHETIC" : "WORKING",
    });

    return NextResponse.json({ ok: true, manuscript }, { status: 201 });
  } catch (error) {
    return libraryServiceUnavailable(error);
  }
}
