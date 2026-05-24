import { resolveTeamAccess } from "@/lib/content-access";
import {
  listHgoStagedArtifactsForOwner,
  saveHgoStagedArtifactForOwner,
} from "@/lib/server/hgo-staged-artifacts";

function getOwnerEmail(access: Awaited<ReturnType<typeof resolveTeamAccess>>) {
  return (
    access.session?.user?.primaryEmail?.trim().toLowerCase() ||
    access.email?.trim().toLowerCase() ||
    ""
  );
}

async function requireTeamOperator() {
  const access = await resolveTeamAccess();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, errors: ["Sign in is required."] },
        { status: 401 },
      ),
    };
  }

  if (!access.isTeam) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, errors: ["Team access is required."] },
        { status: 403 },
      ),
    };
  }

  const ownerEmail = getOwnerEmail(access);

  if (!ownerEmail) {
    return {
      ok: false as const,
      response: Response.json(
        { ok: false, errors: ["Session is missing a usable email."] },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true as const,
    ownerEmail,
    ownerUserId: access.session?.user?.id || undefined,
  };
}

export async function GET(request: Request) {
  const operator = await requireTeamOperator();

  if (!operator.ok) {
    return operator.response;
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const records = await listHgoStagedArtifactsForOwner({
    ownerEmail: operator.ownerEmail,
    includeArchived,
  });

  return Response.json({
    ok: true,
    records,
  });
}

export async function POST(request: Request) {
  const operator = await requireTeamOperator();

  if (!operator.ok) {
    return operator.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, errors: ["Request body must be JSON."] },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { ok: false, errors: ["Request body must be a JSON object."] },
      { status: 400 },
    );
  }

  const payload = body as Record<string, unknown>;
  const artifactJson =
    typeof payload.artifactJson === "string"
      ? payload.artifactJson
      : JSON.stringify(payload.artifact ?? null);
  const note = typeof payload.note === "string" ? payload.note : undefined;

  const result = await saveHgoStagedArtifactForOwner({
    artifactJson,
    ownerEmail: operator.ownerEmail,
    ownerUserId: operator.ownerUserId,
    note,
  });

  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }

  return Response.json(result, { status: result.created ? 201 : 200 });
}
