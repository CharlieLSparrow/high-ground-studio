import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

import { auth } from "@/auth";

import { isImageProxyTokenValid } from "@/lib/reefball/image-proxy-token";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

const REEFBALL_MEDIA_BUCKET =
  process.env.REEFBALL_IMAGE_PROXY_BUCKET ||
  process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BUCKET ||
  process.env.QUIPSLY_MEDIA_BUCKET ||
  "high-ground-odyssey-media";

const REEFBALL_MEDIA_PREFIX =
  process.env.REEFBALL_IMAGE_PROXY_PREFIX ||
  process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_PREFIX ||
  "reefball-workbench/2026-06-09-text-import";
const IMAGE_PROXY_TOKEN_ACTOR = "reefball-image-proxy-token";

const ONE_HOUR_MS = 60 * 60 * 1000;

type ProxyParams = {
  kind: "preview" | "thumb" | "media";
  seq: string;
  size: string;
};

function clean(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function parseSourceUrl(source: string): ProxyParams | null {
  const trimmed = source.trim();
  const directThumb = trimmed.match(/^\/?thumbs\/([0-9]+)\.jpg$/i);
  if (directThumb) {
    return { kind: "thumb", seq: directThumb[1].padStart(4, "0"), size: "" };
  }
  const directMedia = trimmed.match(/^\/?media\/([0-9]+)\.jpg$/i);
  if (directMedia) {
    return { kind: "media", seq: directMedia[1].padStart(4, "0"), size: "" };
  }
  const directPreview = trimmed.match(/^\/?previews-([0-9]+)\/([0-9]+)\.jpg(?:\?[^#\s]*)?$/i);
  if (directPreview) {
    return { kind: "preview", seq: directPreview[2].padStart(4, "0"), size: directPreview[1] || "1800" };
  }

  const relativeMatch = source.match(/^\/api\/(preview|thumb|media)\/([0-9]+)\.jpg(?:\?[^#\s]*)?$/i);
  if (relativeMatch) {
    const kind = relativeMatch[1].toLowerCase() as ProxyParams["kind"];
    const seq = relativeMatch[2].padStart(4, "0");
    return { kind, seq, size: kind === "preview" ? "1800" : "" };
  }

  try {
    const parsed = new URL(source);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/i);
    if (!match) return null;
    const kind = match[1] as ProxyParams["kind"];
    const seq = match[2].padStart(4, "0");
    const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
    return { kind, seq, size };
  } catch {
    return null;
  }
}

function imageObjectFromParams({ kind, seq, size }: ProxyParams) {
  const prefix = clean(REEFBALL_MEDIA_PREFIX);
  if (!seq) return "";
  if (kind === "thumb") return `${prefix}/thumbs/${seq}.jpg`;
  if (kind === "media") return `${prefix}/media/${seq}.jpg`;
  return `${prefix}/previews-${size || "1800"}/${seq}.jpg`;
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

async function resolveActor(request: NextRequest, slug: string) {
  const session = await auth();
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!session?.user?.id && isImageProxyTokenValid(slug, token)) {
    return IMAGE_PROXY_TOKEN_ACTOR;
  }
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
    || session?.user?.email,
  );
  return email;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const actorEmail = await resolveActor(request, slug);
  if (!actorEmail) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const seq = params.get("seq")?.trim() ?? "";
  const kind = (params.get("kind")?.trim() || "").toLowerCase() as ProxyParams["kind"];
  const source = params.get("source");
  const size = params.get("size")?.trim() || "1800";

  let target: ProxyParams | null = null;
  if (seq && (kind === "preview" || kind === "thumb" || kind === "media")) {
    target = { kind, seq: seq.padStart(4, "0"), size };
  }
  if (!target && source) {
    target = parseSourceUrl(source);
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "Unable to resolve image source." }, { status: 400 });
  }

  const isProxyToken = actorEmail === IMAGE_PROXY_TOKEN_ACTOR;
  if (!isProxyToken) {
    const access = await resolveStudioProjectAccess({
      projectSlug: slug,
      email: actorEmail,
      action: "read",
    });
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: "Read access required." }, { status: 403 });
    }
  }
  const objectName = imageObjectFromParams(target);
  if (!objectName) {
    return NextResponse.json({ ok: false, error: "Invalid proxy image parameters." }, { status: 400 });
  }

  try {
    const storage = new Storage();
    const file = storage.bucket(REEFBALL_MEDIA_BUCKET).file(objectName);
    const [buffer] = await file.download();
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating reefball image proxy URL:", error);
    return NextResponse.json({ ok: false, error: "Failed to generate image URL." }, { status: 500 });
  }
}
