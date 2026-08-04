import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  appendEpisodeEditReviewReceipt,
  EpisodeEditReviewLedgerError,
  listEpisodeEditReviewLedger,
  publicEpisodeEditReviewReceipt,
} from "@/lib/server/episode-edit-review-ledger";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

const MAX_REQUEST_BYTES = 64_000;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function projectAndEpisode(input: URL | Record<string, unknown>) {
  if (input instanceof URL) {
    return {
      projectSlug: input.searchParams.get("projectSlug")?.trim() ?? "",
      episodeSlug: input.searchParams.get("episodeSlug")?.trim() ?? "",
    };
  }
  return {
    projectSlug: typeof input.projectSlug === "string" ? input.projectSlug.trim() : "",
    episodeSlug: typeof input.episodeSlug === "string" ? input.episodeSlug.trim() : "",
  };
}

async function authorize(request: Request, projectSlug: string, action: "read" | "write") {
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({ request, projectSlug, action, prisma });
  if (!access.allowed) return { prisma, response: response({ ok: false, errorCode: access.code, error: access.error }, access.status) } as const;
  if (!access.access.projectId) {
    return { prisma, response: response({ ok: false, errorCode: "SOURCE_PROJECT_UNRESOLVED", error: "The authorized Nest has no canonical project identity." }, 409) } as const;
  }
  return { prisma, access } as const;
}

export async function GET(request: Request) {
  const { projectSlug, episodeSlug } = projectAndEpisode(new URL(request.url));
  if (!projectSlug || !episodeSlug) return response({ ok: false, errorCode: "EPISODE_REQUIRED", error: "Project and episode are required." }, 400);
  const authorized = await authorize(request, projectSlug, "read");
  if ("response" in authorized && authorized.response) return authorized.response;
  try {
    const ledger = await listEpisodeEditReviewLedger({
      prisma: authorized.prisma,
      projectId: authorized.access.access.projectId!,
      episodeSlug,
    });
    return response({ ok: true, ...ledger });
  } catch (error) {
    if (error instanceof EpisodeEditReviewLedgerError) return response({ ok: false, errorCode: error.code, error: error.message }, error.status);
    console.error("Could not load episode edit review ledger", error);
    return response({ ok: false, errorCode: "EDIT_REVIEW_LEDGER_UNAVAILABLE", error: "The edit review history is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return response({ ok: false, errorCode: "EDIT_REVIEW_REQUEST_TOO_LARGE", error: "The edit review action is too large." }, 413);
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return response({ ok: false, errorCode: "INVALID_JSON", error: "Provide a valid edit review action." }, 400);
  }
  const { projectSlug, episodeSlug } = projectAndEpisode(body);
  if (!projectSlug || !episodeSlug) return response({ ok: false, errorCode: "EPISODE_REQUIRED", error: "Project and episode are required." }, 400);
  const authorized = await authorize(request, projectSlug, "write");
  if ("response" in authorized && authorized.response) return authorized.response;
  try {
    const receipt = await appendEpisodeEditReviewReceipt({
      prisma: authorized.prisma,
      projectId: authorized.access.access.projectId!,
      episodeSlug,
      actor: authorized.access.actor,
      review: {
        clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : "",
        proposalSetId: typeof body.proposalSetId === "string" ? body.proposalSetId : "",
        action: body.action as never,
        subjectId: typeof body.subjectId === "string" ? body.subjectId : "",
        subjectKind: body.subjectKind as never,
        sourceRange: body.sourceRange as never,
        proposalTimelineFingerprintSha256: typeof body.proposalTimelineFingerprintSha256 === "string" ? body.proposalTimelineFingerprintSha256 : "",
        timelineFingerprintBeforeSha256: typeof body.timelineFingerprintBeforeSha256 === "string" ? body.timelineFingerprintBeforeSha256 : "",
        timelineFingerprintAfterSha256: typeof body.timelineFingerprintAfterSha256 === "string" ? body.timelineFingerprintAfterSha256 : null,
        evidence: body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence) ? body.evidence as Record<string, unknown> : {},
        occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : undefined,
      },
    });
    return response({ ok: true, receipt: publicEpisodeEditReviewReceipt(receipt) }, 201);
  } catch (error) {
    if (error instanceof EpisodeEditReviewLedgerError) return response({ ok: false, errorCode: error.code, error: error.message }, error.status);
    console.error("Could not append episode edit review receipt", error);
    return response({ ok: false, errorCode: "EDIT_REVIEW_LEDGER_UNAVAILABLE", error: "The review action was not durably recorded." }, 503);
  }
}
