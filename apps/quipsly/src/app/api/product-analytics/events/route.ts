import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  isQuipslyProductEventName,
  sanitizeProductEventParameters,
} from "@/lib/product-analytics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson({ ok: false, code: "AUTH_REQUIRED" }, 401);
  }

  let input: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      input = parsed as Record<string, unknown>;
    }
  } catch {
    return privateJson({ ok: false, code: "INVALID_EVENT" }, 400);
  }
  if (!isQuipslyProductEventName(input.eventName)) {
    return privateJson({ ok: false, code: "INVALID_EVENT" }, 400);
  }

  const prisma = getPrismaClient();
  const recentCount = await prisma.userEvent.count({
    where: {
      userId: session.user.id,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
  });
  if (recentCount >= 120) {
    return privateJson({ ok: false, code: "RATE_LIMITED" }, 429);
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  await prisma.userEvent.create({
    data: {
      userId: session.user.id,
      organizationId: membership?.organizationId ?? null,
      eventName: `Product: ${input.eventName}`,
      payloadJson: {
        schema: "quipsly-product-event-v1",
        parameters: sanitizeProductEventParameters(input.parameters),
        source: "web-client",
      },
    },
  });

  return privateJson({ ok: true }, 202);
}
