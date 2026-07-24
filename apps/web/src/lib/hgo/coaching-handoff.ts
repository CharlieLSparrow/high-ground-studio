import {
  QUIPSLY_PUBLIC_COACHING_PACKET_KIND,
  isQuipslyPublicCoachingPacket,
  normalizeQuipslyPublicCoachingOfferings,
  type QuipslyPublicCaptureMode,
  type QuipslyPublicCoachingOffering,
  type QuipslyPublicCoachingResolvedHandoffAction,
  type QuipslyPublicCoachingScheduling,
  type QuipslyPublicCoachingPositioning,
  type QuipslyPublicNativeCapture,
} from "@high-ground/quipsly-domain/coaching-public";

export const HGO_COACHING_HANDOFF_KIND = "hgo-to-quipsly-coaching-handoff-v1" as const;
export const HGO_LEGACY_COACHING_API_FLAG = "HGO_LEGACY_COACHING_API_ENABLED" as const;
export { QUIPSLY_PUBLIC_COACHING_PACKET_KIND };

const DEFAULT_NEST_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_HGO_BASE_URL = "https://highgroundodyssey.com";
const DEFAULT_QUIPSLY_MARKETING_BASE_URL = "https://quipsly.com";

function cleanBaseUrl(value: string | undefined, fallback: string) {
  const candidate = value?.trim();
  if (!candidate) return fallback;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function sameSitePath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function absoluteUrl(baseUrl: string, path: string) {
  return new URL(sameSitePath(path), baseUrl).toString();
}

export function getNestBaseUrl() {
  return cleanBaseUrl(
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
      process.env.NEXT_PUBLIC_QUIPSLY_NEST_URL ||
      process.env.NEST_BASE_URL,
    DEFAULT_NEST_BASE_URL,
  );
}

export function getHgoBaseUrl() {
  return cleanBaseUrl(
    process.env.NEXT_PUBLIC_HGO_SITE_URL ||
      process.env.HGO_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL,
    DEFAULT_HGO_BASE_URL,
  );
}

export function getQuipslyMarketingBaseUrl() {
  return cleanBaseUrl(
    process.env.NEXT_PUBLIC_QUIPSLY_MARKETING_URL ||
      process.env.QUIPSLY_MARKETING_URL ||
      process.env.NEXT_PUBLIC_QUIPSLY_SITE_URL ||
      process.env.QUIPSLY_SITE_URL,
    DEFAULT_QUIPSLY_MARKETING_BASE_URL,
  );
}

export function buildNestLoginHref(callbackPath = "/coaching?source=hgo-coaching&intent=coaching") {
  const url = new URL("/login", getNestBaseUrl());
  url.searchParams.set("callbackUrl", sameSitePath(callbackPath));
  return url.toString();
}

export function buildNestCoachingHref() {
  return absoluteUrl(getNestBaseUrl(), "/coaching?source=hgo-coaching&intent=coaching");
}

export function buildNestPublicCoachingPacketHref() {
  return absoluteUrl(getNestBaseUrl(), "/api/coaching/public?source=hgo-coaching");
}

export function buildQuipslyCoachingEducationHref() {
  return absoluteUrl(getQuipslyMarketingBaseUrl(), "/coaching?source=hgo-coaching");
}

export function getHgoCoachingHandoff() {
  return {
    kind: HGO_COACHING_HANDOFF_KIND,
    hgoBaseUrl: getHgoBaseUrl(),
    nestBaseUrl: getNestBaseUrl(),
    quipslyMarketingBaseUrl: getQuipslyMarketingBaseUrl(),
    primaryBookingHref: buildNestLoginHref(),
    signedInRunwayHref: buildNestCoachingHref(),
    publicPacketHref: buildNestPublicCoachingPacketHref(),
    productEducationHref: buildQuipslyCoachingEducationHref(),
    operatingTruth:
      "High Ground Odyssey explains the coaching offer. Quipsly Nest owns booking, consent, capture, transcript, packet, payment evidence, and review state.",
  };
}

export type QuipslyPublicCoachingPacketResult =
  | {
      ok: true;
      source: "quipsly-public-packet";
      packet: {
        packetKind: typeof QUIPSLY_PUBLIC_COACHING_PACKET_KIND;
        title: string;
        summary: string;
        offerings?: {
          source: string;
          unavailable: boolean;
          items: QuipslyPublicCoachingOffering[];
        };
        positioning?: QuipslyPublicCoachingPositioning;
        scheduling?: QuipslyPublicCoachingScheduling;
        nativeCapture?: QuipslyPublicNativeCapture;
        handoffActions: QuipslyPublicCoachingResolvedHandoffAction[];
      };
      warning: null;
    }
  | {
      ok: false;
      source: "hgo-fallback";
      packet: null;
      warning: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeHandoffActions(value: unknown): QuipslyPublicCoachingResolvedHandoffAction[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((action) => {
    if (!isRecord(action)) return [];

    const id = text(action.id);
    const label = text(action.label);
    const href = text(action.href);
    const hrefKey = text(action.hrefKey);
    if (!id || !label || !href || !hrefKey) return [];

    const audience = text(action.audience);
    const normalizedAudience =
      audience === "public" || audience === "signed-in" || audience === "operator"
        ? audience
        : "public";
    const normalizedHrefKey =
      hrefKey === "signInOrCreateFreeAccount" ||
      hrefKey === "coachingRunway" ||
      hrefKey === "projectsHome" ||
      hrefKey === "captureAppSurface"
        ? hrefKey
        : "coachingRunway";

    return [
      {
        id,
        label,
        audience: normalizedAudience,
        hrefKey: normalizedHrefKey,
        href,
        summary: text(action.summary, "Open Quipsly to continue."),
        boundary: text(
          action.boundary,
          "This public handoff does not create bookings, charge cards, publish content, send messages, or start recordings.",
        ),
        externalSideEffects: false,
      },
    ];
  });
}

function normalizeNativeCapture(value: unknown): QuipslyPublicNativeCapture | undefined {
  if (!isRecord(value)) return undefined;

  const rawModes = Array.isArray(value.modes) ? value.modes : [];
  const modes: QuipslyPublicCaptureMode[] = rawModes.flatMap((mode) => {
    if (!isRecord(mode)) return [];
    const id = text(mode.id);
    if (id !== "coaching" && id !== "podcast" && id !== "research-interview") {
      return [];
    }

    return [
      {
        id,
        label: text(mode.label, id),
        purpose: text(mode.purpose, "Capture this session with explicit consent."),
        nextAction: text(mode.nextAction, "Open Quipsly to continue."),
      },
    ];
  });

  return {
    productionFirst: value.productionFirst === true,
    appSurface: text(value.appSurface, "Quipsly native capture"),
    primaryCallPath: text(
      value.primaryCallPath,
      "Quipsly-owned in-app session rooms are the production call path for coaching, podcast, and research capture.",
    ),
    nativeCallPresentation: text(
      value.nativeCallPresentation,
      "Start native call presentation from the first room workflow so Quipsly calls feel native while the approved provider carries room media.",
    ),
    fallbackCallImport: text(
      value.fallbackCallImport,
      "Normal Phone or FaceTime calls are fallback/import sources only; Quipsly should not depend on Apple Phone calls as the production capture path.",
    ),
    phoneCallBoundary: text(
      value.phoneCallBoundary,
      "Starting a regular phone call is not the same as joining a Quipsly capture room, and Quipsly must not claim recording, consent, transcript, or packet truth for external calls until imported evidence exists.",
    ),
    pstnBridgeCandidate: text(
      value.pstnBridgeCandidate,
      "A Twilio or similar PSTN bridge can be evaluated later for dial-in clients, but it remains an evidence provider around the Quipsly session, not the session source of truth.",
    ),
    localSourceTruth: text(
      value.localSourceTruth,
      "Local recording files remain source truth until Nest verifies durable server storage.",
    ),
    uploadRule: text(
      value.uploadRule,
      "Uploads are resumable, receipt-backed, and recoverable.",
    ),
    verificationRule: text(
      value.verificationRule,
      "Nest verifies capture evidence before treating it as reusable.",
    ),
    deletionRule: text(
      value.deletionRule,
      "Original recordings are never silently deleted.",
    ),
    modes,
  };
}

function normalizePositioning(value: unknown): QuipslyPublicCoachingPositioning | undefined {
  if (!isRecord(value)) return undefined;

  const rawPillars = Array.isArray(value.pillars) ? value.pillars : [];
  const pillars = rawPillars.flatMap((pillar) => {
    if (!isRecord(pillar)) return [];
    const id = text(pillar.id);
    if (id !== "research" && id !== "studio" && id !== "tower") return [];
    const pillarId: "research" | "studio" | "tower" = id;

    return [
      {
        id: pillarId,
        label: text(pillar.label, id),
        promise: text(pillar.promise, "Make the next safe action visible."),
        coachingUse: text(pillar.coachingUse, "Keep coaching work inspectable."),
      },
    ];
  });

  const audience = Array.isArray(value.audience)
    ? value.audience.flatMap((item) => {
        const label = text(item);
        return label ? [label] : [];
      })
    : [];

  return {
    audience,
    promise: text(
      value.promise,
      "Quipsly turns recorded conversations, source notes, decisions, transcripts, and follow-up work into inspectable creative assets.",
    ),
    systemsAnxietyLine: text(
      value.systemsAnxietyLine,
      "The interface should make the next safe action visible.",
    ),
    hgoRole: text(value.hgoRole, "High Ground Odyssey is the public doorway."),
    quipslyRole: text(value.quipslyRole, "Quipsly Nest owns operational truth."),
    pillars,
  };
}

function normalizeScheduling(value: unknown): QuipslyPublicCoachingScheduling | undefined {
  if (!isRecord(value)) return undefined;

  return {
    provider: "google-calendar",
    defaultTimezone: text(value.defaultTimezone, "America/Los_Angeles"),
    defaultTimezoneLabel: text(value.defaultTimezoneLabel, "Pacific time"),
    operatorDefault: text(
      value.operatorDefault,
      "Homer is in Orange County, so new coaching holds and bookings default to Pacific time unless the coach, booking, or client-facing selection explicitly overrides it.",
    ),
    clientDisplayRule: text(
      value.clientDisplayRule,
      "Clients should see the session time clearly before payment, calendar sync, or joining a capture room.",
    ),
    calendarEvidenceBoundary: text(
      value.calendarEvidenceBoundary,
      "Google Calendar is scheduling evidence and convenience. Quipsly owns booking, room, consent, recording, transcript, notes, goals, and follow-up truth.",
    ),
    externalCalendarBoundary: text(
      value.externalCalendarBoundary,
      "Do not claim an external calendar invite exists until Quipsly has a provider event ID, calendar ID, or event link receipt.",
    ),
    safeNextAction: text(
      value.safeNextAction,
      "Create or review the Quipsly booking first, then sync calendar evidence only after the human-readable time looks right.",
    ),
    calendarIdConfigured: value.calendarIdConfigured === true,
  };
}

export async function getQuipslyPublicCoachingPacket(): Promise<QuipslyPublicCoachingPacketResult> {
  const handoff = getHgoCoachingHandoff();

  try {
    const response = await fetch(handoff.publicPacketHref, {
      cache: "no-store",
      signal: AbortSignal.timeout(2200),
    });

    if (!response.ok) {
      return {
        ok: false,
        source: "hgo-fallback",
        packet: null,
        warning: `Quipsly public coaching packet returned HTTP ${response.status}.`,
      };
    }

    const json: unknown = await response.json();
    if (!isQuipslyPublicCoachingPacket(json)) {
      return {
        ok: false,
        source: "hgo-fallback",
        packet: null,
        warning: "Quipsly public coaching packet had an unexpected shape.",
      };
    }

    return {
      ok: true,
      source: "quipsly-public-packet",
      packet: {
        packetKind: QUIPSLY_PUBLIC_COACHING_PACKET_KIND,
        title: typeof json.title === "string" ? json.title : "High Ground Odyssey Coaching in Quipsly",
        summary:
          typeof json.summary === "string"
            ? json.summary
            : "Quipsly Nest is the operational home for booking, consent, capture, transcript review, coaching packets, payment evidence, and follow-up state.",
        offerings: {
          source: isRecord(json.offerings) && typeof json.offerings.source === "string" ? json.offerings.source : "unknown",
          unavailable: isRecord(json.offerings) ? json.offerings.unavailable === true : true,
          items: normalizeQuipslyPublicCoachingOfferings(json.offerings),
        },
        positioning: normalizePositioning(json.positioning),
        scheduling: normalizeScheduling(json.scheduling),
        nativeCapture: normalizeNativeCapture(json.nativeCapture),
        handoffActions: normalizeHandoffActions(json.handoffActions),
      },
      warning: null,
    };
  } catch (error) {
    return {
      ok: false,
      source: "hgo-fallback",
      packet: null,
      warning:
        error instanceof Error
          ? error.message
          : "Quipsly public coaching packet was unavailable.",
    };
  }
}

export function isHgoLegacyCoachingApiEnabled() {
  return process.env[HGO_LEGACY_COACHING_API_FLAG] === "true";
}

export function getHgoCoachingApiHandoff(action: string) {
  const handoff = getHgoCoachingHandoff();

  return {
    ok: false,
    disabled: true,
    kind: "hgo-coaching-api-to-quipsly-handoff-v1",
    action,
    error:
      "High Ground Odyssey is the public coaching doorway. Quipsly Nest owns booking, payment evidence, consent, capture, transcript, packet, and review state.",
    enableLegacyFlag: HGO_LEGACY_COACHING_API_FLAG,
    handoff: {
      primaryBookingHref: handoff.primaryBookingHref,
      signedInRunwayHref: handoff.signedInRunwayHref,
      publicPacketHref: handoff.publicPacketHref,
      operatingTruth: handoff.operatingTruth,
    },
  };
}
