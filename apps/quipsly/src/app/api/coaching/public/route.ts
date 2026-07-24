import { NextResponse } from "next/server";
import {
  QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS,
  QUIPSLY_NATIVE_CAPTURE_CONTRACT,
  QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS,
  QUIPSLY_PUBLIC_LOOP_STATUS,
  QUIPSLY_PUBLIC_COACHING_SCHEDULING,
  QUIPSLY_PUBLIC_COACHING_POSITIONING,
  QUIPSLY_PUBLIC_COACHING_PACKET_KIND,
  QUIPSLY_COACHING_CLIENT_JOURNEY,
  QUIPSLY_COACHING_OPERATOR_JOURNEY,
  type QuipslyPublicCoachingOfferings,
  type QuipslyPublicCoachingPacket,
} from "@high-ground/quipsly-domain/coaching-public";

import { getPrismaClient } from "@/lib/prisma";
import { getCoachingCalendarReadiness } from "@/lib/server/coaching-google-calendar";

export const runtime = "nodejs";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const proto = forwardedProto || url.protocol.replace(/:$/, "") || "https";
  return `${proto}://${host}`;
}

function sameSitePath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/projects";
  return value;
}

function absoluteUrl(origin: string, path: string) {
  return new URL(sameSitePath(path), origin).toString();
}

function moneyLabel(cents: number | null | undefined, currency: string | null | undefined) {
  if (typeof cents !== "number" || cents <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

async function loadPublicOfferings(): Promise<QuipslyPublicCoachingOfferings> {
  try {
    const prisma = getPrismaClient() as any;
    const offerings = await prisma.serviceOffering.findMany({
      where: {
        isActive: true,
        kind: { in: [...QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS] },
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      take: 12,
      include: {
        coachProfile: {
          include: {
            user: { select: { name: true, image: true } },
          },
        },
      },
    });

    return {
      source: "quipsly-database",
      unavailable: false,
      items: offerings.map((offering: any) => ({
        id: offering.id,
        slug: offering.slug,
        title: offering.title,
        description: offering.description,
        kind: offering.kind,
        paymentPolicy: offering.paymentPolicy,
        durationMinutes: offering.durationMinutes,
        priceLabel:
          moneyLabel(offering.priceCents, offering.currency) ||
          (offering.paymentPolicy === "PAID_ONE_TO_ONE" ? "Custom quote" : null),
        coachName: offering.coachProfile?.user?.name || "High Ground coach",
        nextAction:
          offering.paymentPolicy === "PAID_ONE_TO_ONE"
            ? "Sign in to Quipsly to request a booking hold or custom checkout link."
            : "Sign in to Quipsly to request or schedule this session.",
      })),
    };
  } catch (error) {
    return {
      source: "unavailable",
      unavailable: true,
      error:
        error instanceof Error
          ? error.message
          : "Offerings are unavailable right now.",
      items: [],
    };
  }
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "direct";
  const callbackPath = `/coaching?source=${encodeURIComponent(source)}&intent=coaching`;
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  const offerings = await loadPublicOfferings();
  const calendarReadiness = getCoachingCalendarReadiness();
  const links = {
    signInOrCreateFreeAccount: loginUrl.toString(),
    coachingRunway: absoluteUrl(origin, callbackPath),
    projectsHome: absoluteUrl(origin, "/projects"),
    captureAppSurface: absoluteUrl(origin, "/call?purpose=COACHING"),
  };

  const packet = {
    ok: true,
    packetKind: QUIPSLY_PUBLIC_COACHING_PACKET_KIND,
    generatedAt: new Date().toISOString(),
    source,
    title: "High Ground Odyssey Coaching in Quipsly",
    summary:
      "Quipsly Nest is the operational home for coaching booking, consent-aware capture, transcript review, coaching packets, payment evidence, and follow-up state.",
    links,
    boundaries: {
      publicPage:
        "High Ground Odyssey may explain the offer and send people to Quipsly.",
      quipslyTruth:
        "Quipsly owns booking, consent, capture rooms, recordings, transcripts, coaching packets, payment evidence, and review state.",
      noExternalSideEffects:
        "This packet does not create bookings, charge cards, publish content, send messages, or start recordings.",
    },
    freeAccount:
      "New Google and email/password users get a free Quipsly account and private Home Nest during Firebase-backed sign-in.",
    publicLoop: QUIPSLY_PUBLIC_LOOP_STATUS,
    positioning: QUIPSLY_PUBLIC_COACHING_POSITIONING,
    scheduling: {
      ...QUIPSLY_PUBLIC_COACHING_SCHEDULING,
      provider: "google-calendar",
      defaultTimezone: calendarReadiness.defaultTimezone,
      calendarIdConfigured: calendarReadiness.calendarIdConfigured,
      calendarEvidenceBoundary: calendarReadiness.sourceOfTruth,
      safeNextAction: calendarReadiness.nextAction,
    },
    nativeCapture: QUIPSLY_NATIVE_CAPTURE_CONTRACT,
    clientJourney: QUIPSLY_COACHING_CLIENT_JOURNEY,
    operatorJourney: QUIPSLY_COACHING_OPERATOR_JOURNEY,
    offerings,
    handoffActions: QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS.map((action) => ({
      ...action,
      href: links[action.hrefKey],
    })),
    steps: [
      "Sign in or create a free Quipsly account.",
      "Open the coaching runway.",
      "Create or review a booking hold.",
      "Confirm consent before recording or transcription.",
      "Use transcripts and packets as inspectable coaching follow-up material.",
    ],
  } satisfies QuipslyPublicCoachingPacket;

  return NextResponse.json(packet);
}
