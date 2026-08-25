export const QUIPSLY_PUBLIC_COACHING_PACKET_KIND =
  "quipsly-public-coaching-handoff-v1" as const;

export const QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS = [
  "ONE_TO_ONE_COACHING",
  "PODCAST_CAPTURE",
  "RESEARCH_INTERVIEW",
] as const;

export type QuipslyPublicCoachingOfferingKind =
  (typeof QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS)[number];

export type QuipslyPublicCoachingOffering = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  kind: string;
  paymentPolicy: string;
  durationMinutes: number;
  priceLabel?: string | null;
  coachName: string;
  nextAction: string;
  bookingPath: string;
  bookableSlots: QuipslyPublicCoachingBookableSlot[];
};

export type QuipslyPublicCoachingBookableSlot = {
  instant: string;
  timezone: string;
  label: string;
};

export type QuipslyPublicCoachingLinkKey =
  | "signInOrCreateFreeAccount"
  | "coachingRunway"
  | "projectsHome"
  | "captureAppSurface";

export type QuipslyPublicCoachingHandoffAction = {
  id: string;
  label: string;
  audience: "public" | "signed-in" | "operator";
  hrefKey: QuipslyPublicCoachingLinkKey;
  summary: string;
  boundary: string;
  externalSideEffects: false;
};

export type QuipslyPublicCoachingResolvedHandoffAction =
  QuipslyPublicCoachingHandoffAction & {
    href: string;
  };

export const QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS: QuipslyPublicCoachingHandoffAction[] = [
  {
    id: "start-free-account",
    label: "Sign in or create a free Quipsly account",
    audience: "public",
    hrefKey: "signInOrCreateFreeAccount",
    summary:
      "Create the app-owned user and Home Nest before any booking, payment, or capture state is created.",
    boundary:
      "This opens Quipsly auth. It does not create a paid booking, charge a card, invite anyone, or start recording.",
    externalSideEffects: false,
  },
  {
    id: "open-coaching-runway",
    label: "Open the coaching runway",
    audience: "signed-in",
    hrefKey: "coachingRunway",
    summary:
      "Review available offerings, booking holds, payment evidence, consent, capture rooms, transcripts, and packet readiness in Nest.",
    boundary:
      "Runway actions are explicit and receipt-backed. Public pages must not duplicate booking or payment logic.",
    externalSideEffects: false,
  },
  {
    id: "prepare-capture",
    label: "Prepare a capture room",
    audience: "operator",
    hrefKey: "captureAppSurface",
    summary:
      "Use Quipsly native capture for visible consent, local source-safe recording, upload verification, and transcript repair.",
    boundary:
      "Opening capture does not start recording. Recording requires visible user action and consent state.",
    externalSideEffects: false,
  },
  {
    id: "return-to-nest",
    label: "Return to your Nest",
    audience: "signed-in",
    hrefKey: "projectsHome",
    summary:
      "Use the Nest home base for session packets, notes, assets, writing, research, and publishing receipts.",
    boundary:
      "Nest is the operational workbench. External platforms remain evidence providers until receipts are attached.",
    externalSideEffects: false,
  },
];

export type QuipslyPublicCoachingOfferings = {
  source: string;
  unavailable: boolean;
  error?: string;
  items: QuipslyPublicCoachingOffering[];
};

export type QuipslyPublicCoachingJourneyStep = {
  id: string;
  label: string;
  plainEnglish: string;
  quipslyTruth: string;
  hiddenSideEffects: false;
};

export type QuipslyPublicCoachingScheduling = {
  provider: "google-calendar";
  defaultTimezone: string;
  defaultTimezoneLabel: string;
  operatorDefault: string;
  clientDisplayRule: string;
  calendarEvidenceBoundary: string;
  externalCalendarBoundary: string;
  safeNextAction: string;
  calendarIdConfigured?: boolean;
};

export type QuipslyPublicLoopOwner = {
  id: "hgo" | "quipsly-com" | "nest" | "native-capture";
  label: string;
  responsibility: string;
  sourceOfTruth: boolean;
  safeBoundary: string;
};

export type QuipslyPublicLoopProofState = {
  id: "source" | "preview" | "live" | "device-review";
  label: string;
  currentState:
    | "source-ready"
    | "preview-required"
    | "live-required"
    | "device-required";
  proof: string;
  notProof: string;
};

export type QuipslyPublicLoopSafeNextAction = {
  id:
    | "inspect-public-packet"
    | "open-coaching-runway"
    | "prepare-reviewer-capture-session"
    | "run-capture-review-smoke";
  label: string;
  summary: string;
  boundary: string;
  externalSideEffects: false;
};

export type QuipslyPublicLoopStatus = {
  generatedFor: "public-loop-readiness";
  owners: QuipslyPublicLoopOwner[];
  proofLadder: QuipslyPublicLoopProofState[];
  safeNextActions: QuipslyPublicLoopSafeNextAction[];
};

export const QUIPSLY_PUBLIC_LOOP_STATUS: QuipslyPublicLoopStatus = {
  generatedFor: "public-loop-readiness",
  owners: [
    {
      id: "hgo",
      label: "HighGroundOdyssey.com",
      responsibility:
        "Public coaching, story, and business doorway. HighGroundOdyssey.com teaches and routes public coaching, story, and business context.",
      sourceOfTruth: false,
      safeBoundary:
        "HGO can explain coaching and open Quipsly. It must not become booking, consent, payment, recording, transcript, or packet truth.",
    },
    {
      id: "quipsly-com",
      label: "Quipsly.com",
      responsibility:
        "Product education funnel for Research, Studio, Tower, and coaching capture. Quipsly.com educates and funnels storytellers, coaches, trainers, and researchers into the product model.",
      sourceOfTruth: false,
      safeBoundary:
        "Quipsly.com can teach Research, Studio, Tower, and coaching capture. It does not own app records.",
    },
    {
      id: "nest",
      label: "Quipsly Nest",
      responsibility:
        "Operational source of truth for users, booking, consent, payment evidence, capture rooms, transcripts, coaching packets, and review state. Nest owns operational truth for users, booking, consent, payment evidence, capture rooms, recordings, transcripts, packets, and review state.",
      sourceOfTruth: true,
      safeBoundary:
        "Nest actions must be explicit, authenticated when needed, and receipt-backed before claiming external effects.",
    },
    {
      id: "native-capture",
      label: "Quipsly native capture",
      responsibility:
        "Local-first recorder. Local recordings remain source truth until server verification and explicit retention policy. Native capture stays local-first and source-safe for coaching, podcast, and research interview recording.",
      sourceOfTruth: false,
      safeBoundary:
        "Local recordings remain source truth until Nest verifies upload and an explicit retention policy permits cleanup.",
    },
  ],
  proofLadder: [
    {
      id: "source",
      label: "Source and local proof",
      currentState: "source-ready",
      proof:
        "Static smokes, typechecks, and production builds can prove this source contains the HGO, Quipsly, Nest, and native capture contracts.",
      notProof:
        "Source-ready does not prove the public domains have been deployed or promoted.",
    },
    {
      id: "preview",
      label: "No-traffic preview proof",
      currentState: "preview-required",
      proof:
        "Preview route matrix and public integration smoke prove the new Cloud Run revisions behave correctly before promotion.",
      notProof:
        "Preview proof is not live traffic and should not be described as customer-visible.",
    },
    {
      id: "live",
      label: "Live route proof",
      currentState: "live-required",
      proof:
        "Live route matrix and integration smoke prove HGO, Quipsly.com, and Nest are serving the current public loop.",
      notProof: "A passing build or local JSON route is not live proof.",
    },
    {
      id: "device-review",
      label: "Native device review proof",
      currentState: "device-required",
      proof:
        "A reviewer/test account, visible capture session, and device/TestFlight smoke prove native capture can be reviewed safely.",
      notProof:
        "Static App Store checks are necessary but not enough for real device readiness.",
    },
  ],
  safeNextActions: [
    {
      id: "inspect-public-packet",
      label: "Inspect this public packet",
      summary:
        "Read the ownership, proof, and handoff contract before touching booking, payment, or recording flows.",
      boundary:
        "Inspection is side-effect-free and does not create records or contact anyone.",
      externalSideEffects: false,
    },
    {
      id: "open-coaching-runway",
      label: "Open the Nest coaching runway",
      summary:
        "Use Nest to review booking holds, capture rooms, consent, transcript jobs, and packet readiness.",
      boundary:
        "Runway actions are app-owned and explicit. External providers remain evidence sources.",
      externalSideEffects: false,
    },
    {
      id: "prepare-reviewer-capture-session",
      label: "Prepare a reviewer-safe capture session",
      summary:
        "Create a reviewer login and visible app-owned capture room before TestFlight or App Review.",
      boundary:
        "Reviewer setup must not charge, invite, publish, create an external calendar event, or start recording.",
      externalSideEffects: false,
    },
    {
      id: "run-capture-review-smoke",
      label: "Run capture reviewer smoke",
      summary:
        "Verify native auth, visible session state, consent boundary, and review digest readiness.",
      boundary:
        "Smoke checks read evidence and should not mutate external accounts or start a real recording.",
      externalSideEffects: false,
    },
  ],
};

export type QuipslyPublicCoachingPositioningPillar = {
  id: "research" | "studio" | "tower";
  label: string;
  promise: string;
  coachingUse: string;
};

export type QuipslyPublicCoachingPositioning = {
  audience: string[];
  promise: string;
  systemsAnxietyLine: string;
  hgoRole: string;
  quipslyRole: string;
  pillars: QuipslyPublicCoachingPositioningPillar[];
};

export const QUIPSLY_PUBLIC_COACHING_POSITIONING: QuipslyPublicCoachingPositioning = {
  audience: ["storytellers", "coaches", "trainers", "researchers"],
  promise:
    "Quipsly turns recorded conversations, source notes, decisions, transcripts, and follow-up work into inspectable creative assets instead of scattered aftermath.",
  systemsAnxietyLine:
    "The interface should make the next safe action visible: requested, held, paid, consented, recorded, uploaded, transcribed, packeted, reviewed, and receipt-backed.",
  hgoRole:
    "High Ground Odyssey is the public story, coaching, and business doorway.",
  quipslyRole:
    "Quipsly Nest owns operational truth for users, bookings, consent, capture assets, transcript jobs, coaching packets, payment evidence, and publishing receipts.",
  pillars: [
    {
      id: "research",
      label: "Research",
      promise: "Capture, source, and connect the raw material.",
      coachingUse:
        "Session prep, intake notes, frameworks, observations, and transcript evidence stay findable.",
    },
    {
      id: "studio",
      label: "Studio",
      promise: "Shape the material into usable work.",
      coachingUse:
        "Recordings become transcripts, notes, action items, packets, podcast episodes, shorts, and reusable teaching assets.",
    },
    {
      id: "tower",
      label: "Tower",
      promise: "Package, publish, and learn with receipts.",
      coachingUse:
        "Follow-up packets, platform-ready materials, scheduling state, payment evidence, and publication receipts stay separate and visible.",
    },
  ],
};

export const QUIPSLY_PUBLIC_COACHING_SCHEDULING: QuipslyPublicCoachingScheduling = {
  provider: "google-calendar",
  defaultTimezone: "America/Los_Angeles",
  defaultTimezoneLabel: "Pacific time",
  operatorDefault:
    "Homer is in Orange County, so new coaching holds and bookings default to Pacific time unless the coach, booking, or client-facing selection explicitly overrides it.",
  clientDisplayRule:
    "Clients should see the session time clearly before payment, calendar sync, or joining a capture room.",
  calendarEvidenceBoundary:
    "Google Calendar is scheduling evidence and convenience. Quipsly owns booking, payment evidence, room, consent, recording, transcript, notes, goals, and follow-up truth.",
  externalCalendarBoundary:
    "Do not claim an external calendar invite exists until Quipsly has a provider event ID, calendar ID, or event link receipt.",
  safeNextAction:
    "Create or review the Quipsly booking first, then sync calendar evidence only after the human-readable time looks right.",
};

export type QuipslyPublicCaptureMode = {
  id: "coaching" | "podcast" | "research-interview";
  label: string;
  purpose: string;
  nextAction: string;
};

export type QuipslyPublicNativeCapture = {
  productionFirst: boolean;
  appSurface: string;
  primaryCallPath: string;
  nativeCallPresentation: string;
  fallbackCallImport: string;
  phoneCallBoundary: string;
  pstnBridgeCandidate: string;
  localSourceTruth: string;
  uploadRule: string;
  verificationRule: string;
  deletionRule: string;
  modes: QuipslyPublicCaptureMode[];
};

export const QUIPSLY_NATIVE_CAPTURE_CONTRACT: QuipslyPublicNativeCapture = {
  productionFirst: true,
  appSurface: "Quipsly native capture",
  primaryCallPath:
    "Quipsly-owned in-app session rooms are the production call path for coaching, podcast, and research capture.",
  nativeCallPresentation:
    "Start CallKit integration from the first native-room workflow so Quipsly calls feel native on iOS, while LiveKit/WebRTC or another approved provider carries the actual room media.",
  fallbackCallImport:
    "Normal Phone or FaceTime calls are fallback/import sources only; users may manually import recordings or transcripts, but Quipsly should not depend on Apple Phone calls as the production capture path.",
  phoneCallBoundary:
    "Starting a regular phone call is not the same as joining a Quipsly capture room, and Quipsly must not claim recording, consent, transcript, or packet truth for external calls until imported evidence exists.",
  pstnBridgeCandidate:
    "A Twilio or similar PSTN bridge can be evaluated later for dial-in clients, but it remains an evidence provider around the Quipsly session, not the session source of truth.",
  localSourceTruth:
    "Local recording files remain source truth until Nest verifies durable server storage.",
  uploadRule:
    "Uploads are resumable, receipt-backed, and recoverable; a failed upload holds the local recording instead of pretending it succeeded.",
  verificationRule:
    "Nest should verify byte presence, transcript repair state, consent, and packet readiness before treating capture as reusable.",
  deletionRule:
    "Original recordings are never silently deleted; cleanup requires server verification and an explicit retention rule.",
  modes: [
    {
      id: "coaching",
      label: "One-to-one coaching",
      purpose:
        "Consent-aware coaching sessions with payment evidence, notes, action items, transcript review, and follow-up packets.",
      nextAction:
        "Create or open a coaching booking, confirm consent, then join from the native capture app.",
    },
    {
      id: "podcast",
      label: "Podcast capture",
      purpose:
        "Double-ended or local-first podcast recording where the durable audio becomes the spine for episodes and shorts.",
      nextAction:
        "Open the podcast or capture room, record local tracks, and let Quipsly assemble transcript and production assets.",
    },
    {
      id: "research-interview",
      label: "Research interview",
      purpose:
        "Interviews, oral histories, and expert calls that become searchable source material instead of disappearing into a meeting app.",
      nextAction:
        "Start from a Nest research session, capture with explicit consent, then review transcript segments and source notes.",
    },
  ],
};

export const QUIPSLY_COACHING_CLIENT_JOURNEY: QuipslyPublicCoachingJourneyStep[] = [
  {
    id: "create-free-account",
    label: "Create a free Quipsly account",
    plainEnglish:
      "The coachee signs in once so session details, payment links, consent, recordings, transcripts, and follow-up packets have one private home.",
    quipslyTruth:
      "Firebase proves identity; Quipsly creates the app-owned user and Home Nest.",
    hiddenSideEffects: false,
  },
  {
    id: "request-or-confirm-session",
    label: "Request or confirm the session",
    plainEnglish:
      "The coachee can ask for help, confirm a proposed time, or wait for Homer to send the next clear step.",
    quipslyTruth:
      "Quipsly stores booking holds and session state before any calendar, payment, or recording provider is treated as evidence.",
    hiddenSideEffects: false,
  },
  {
    id: "review-price-and-pay",
    label: "Review price, then pay if needed",
    plainEnglish:
      "If the session is paid, the coachee opens a Stripe-hosted checkout page for that exact booking instead of typing card details into Quipsly.",
    quipslyTruth:
      "Stripe Checkout is payment evidence. The booking is not marked paid until receipt or webhook evidence lands in Quipsly.",
    hiddenSideEffects: false,
  },
  {
    id: "join-with-consent",
    label: "Join with visible consent",
    plainEnglish:
      "Recording and transcription should be obvious, opt-in, and visible. Opening a room is not the same as starting a recording.",
    quipslyTruth:
      "Consent, local capture, provider egress, uploads, transcripts, and packets stay separate inspectable states.",
    hiddenSideEffects: false,
  },
  {
    id: "receive-follow-up-packet",
    label: "Receive the useful follow-up",
    plainEnglish:
      "After the session, Quipsly helps turn the conversation into notes, action items, transcript highlights, and reusable packets.",
    quipslyTruth:
      "Packets are reviewable artifacts built from evidence, not a hidden rewrite of what happened.",
    hiddenSideEffects: false,
  },
];

export const QUIPSLY_COACHING_OPERATOR_JOURNEY: QuipslyPublicCoachingJourneyStep[] = [
  {
    id: "setup-coach-profile",
    label: "Set Homer up once",
    plainEnglish:
      "Create the coach profile, default one-to-one offer, flexible scheduling clue, and coach role from one calm setup card.",
    quipslyTruth:
      "Quipsly owns the coach profile, role, offer, and app-owned user records.",
    hiddenSideEffects: false,
  },
  {
    id: "create-booking-hold",
    label: "Create the booking hold",
    plainEnglish:
      "Enter the coachee email, name, session title, time, duration, and custom price without needing a second admin tool.",
    quipslyTruth:
      "Booking and payment intent are app-owned first. Calendar and Stripe are provider evidence later.",
    hiddenSideEffects: false,
  },
  {
    id: "send-hosted-payment",
    label: "Send the hosted payment link",
    plainEnglish:
      "When the details look right, create or copy a Stripe-hosted checkout link for that one booking.",
    quipslyTruth:
      "No live card charge is enabled unless the explicit live Stripe guard is on and the operator takes that exact action.",
    hiddenSideEffects: false,
  },
  {
    id: "capture-session",
    label: "Capture only when everyone knows",
    plainEnglish:
      "Open the room, confirm consent, record locally or through the provider path, and keep local source files until upload is verified.",
    quipslyTruth:
      "Recordings remain source-safe. Failed uploads hold the local file instead of pretending the session is reusable.",
    hiddenSideEffects: false,
  },
  {
    id: "review-and-send-packet",
    label: "Review and send the packet",
    plainEnglish:
      "Use transcript highlights, notes, action items, and receipts to prepare follow-up without losing track of the original session.",
    quipslyTruth:
      "Quipsly keeps transcript, packet, payment, calendar, and publication receipts separate and visible.",
    hiddenSideEffects: false,
  },
];

export type QuipslyPublicCoachingPacket = {
  ok: true;
  packetKind: typeof QUIPSLY_PUBLIC_COACHING_PACKET_KIND;
  generatedAt: string;
  source: string;
  title: string;
  summary: string;
  links: {
    signInOrCreateFreeAccount: string;
    coachingRunway: string;
    projectsHome: string;
    captureAppSurface: string;
  };
  boundaries: {
    publicPage: string;
    quipslyTruth: string;
    noExternalSideEffects: string;
  };
  freeAccount: string;
  publicLoop: QuipslyPublicLoopStatus;
  positioning: QuipslyPublicCoachingPositioning;
  scheduling: QuipslyPublicCoachingScheduling;
  offerings: QuipslyPublicCoachingOfferings;
  nativeCapture: QuipslyPublicNativeCapture;
  clientJourney: QuipslyPublicCoachingJourneyStep[];
  operatorJourney: QuipslyPublicCoachingJourneyStep[];
  handoffActions: QuipslyPublicCoachingResolvedHandoffAction[];
  steps: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isQuipslyPublicCoachingPacket(
  value: unknown,
): value is QuipslyPublicCoachingPacket {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.packetKind === QUIPSLY_PUBLIC_COACHING_PACKET_KIND &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    isRecord(value.links) &&
    isRecord(value.boundaries)
  );
}

export function normalizeQuipslyPublicCoachingOfferings(
  value: unknown,
): QuipslyPublicCoachingOffering[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];

  return value.items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = text(item.id);
    const slug = text(item.slug);
    const title = text(item.title);
    if (!id || !slug || !title) return [];

    return [
      {
        id,
        slug,
        title,
        description: text(item.description) || null,
        kind: text(item.kind, "ONE_TO_ONE_COACHING"),
        paymentPolicy: text(item.paymentPolicy, "DONATION_SUPPORTED"),
        durationMinutes:
          typeof item.durationMinutes === "number" ? item.durationMinutes : 60,
        priceLabel: text(item.priceLabel) || null,
        coachName: text(item.coachName, "High Ground coach"),
        nextAction: text(item.nextAction, "Sign in to Quipsly to continue."),
        bookingPath: text(item.bookingPath, `/coaching/book/${encodeURIComponent(slug)}`),
        bookableSlots: Array.isArray(item.bookableSlots)
          ? item.bookableSlots.flatMap((slot) => {
              if (!isRecord(slot)) return [];
              const instant = text(slot.instant);
              const timezone = text(slot.timezone);
              const label = text(slot.label);
              return instant && timezone && label
                ? [{ instant, timezone, label }]
                : [];
            })
          : [],
      },
    ];
  });
}
