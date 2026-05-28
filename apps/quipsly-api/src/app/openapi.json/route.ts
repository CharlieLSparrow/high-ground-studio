import { NextResponse } from "next/server";
import { buildQuipslyOpenApiDocument } from "@high-ground/quipsly-domain/openapi";
import { withCorsInit } from "@/lib/api";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(buildQuipslyOpenApiDocument(origin), withCorsInit());
}
