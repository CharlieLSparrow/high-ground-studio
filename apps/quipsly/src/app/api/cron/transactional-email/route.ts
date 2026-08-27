import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  authorizeTransactionalEmailWorker,
  runTransactionalEmailMaintenance,
} from "@/lib/server/transactional-email-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeTransactionalEmailWorker({
    authorization: request.headers.get("authorization"),
  });
  if (authorization === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "Transactional email maintenance is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (authorization !== "authorized") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const result = await runTransactionalEmailMaintenance({
      prisma: getPrismaClient(),
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Transactional email maintenance failed", error);
    return NextResponse.json(
      { ok: false, error: "Transactional email maintenance did not complete." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
