import "server-only";

import type { TransactionalEmailKind } from "@prisma/client";

import { normalizeEmail } from "@/lib/server/studio-user-identity";

export type TransactionalEmailSendResult =
  | { ok: true; provider: "resend"; providerMessageId: string }
  | {
      ok: false;
      provider: "resend";
      code:
        | "EMAIL_NOT_CONFIGURED"
        | "PUBLIC_URL_NOT_CONFIGURED"
        | "INVALID_RECIPIENT"
        | "INVALID_SESSION_URL"
        | "LOCAL_TEST_RECIPIENT"
        | "RATE_LIMITED"
        | "PROVIDER_REJECTED"
        | "PROVIDER_UNAVAILABLE";
      message: string;
      retryAfterSeconds: number | null;
    };

function compact(value: unknown, max = 320) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function validSender(value: string) {
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1] || value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bracketed.trim());
}

function publicBaseUrl() {
  const configured =
    process.env.QUIPSLY_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") return null;
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

export function transactionalSessionUrl(roomId: string) {
  const base = publicBaseUrl();
  const cleanRoomId = roomId.trim();
  if (!base || !cleanRoomId || cleanRoomId.length > 180) return null;
  const url = new URL(`/sessions/${encodeURIComponent(cleanRoomId)}`, base);
  url.searchParams.set("mode", "live");
  return url;
}

export function transactionalEmailReadiness():
  | {
      available: false;
      status: "EMAIL_NOT_CONFIGURED" | "PUBLIC_URL_NOT_CONFIGURED";
    }
  | { available: true; status: "AVAILABLE" } {
  const apiKey =
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "";
  const from =
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM?.trim() ||
    process.env.HGO_EMAIL_FROM?.trim() ||
    "";
  if (!apiKey || !from || !validSender(from)) {
    return { available: false, status: "EMAIL_NOT_CONFIGURED" as const };
  }
  if (!publicBaseUrl()) {
    return { available: false, status: "PUBLIC_URL_NOT_CONFIGURED" as const };
  }
  return { available: true, status: "AVAILABLE" as const };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function retryAfter(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null;
}

function sessionTime(input: { scheduledStart: Date; timezone: string }) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: input.timezone,
    }).format(input.scheduledStart);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(input.scheduledStart) + " UTC";
  }
}

function copyForKind(kind: TransactionalEmailKind) {
  if (kind === "SESSION_REMINDER_24H") {
    return {
      subjectPrefix: "Your Quipsly Session is tomorrow",
      headline: "Your Session is coming up tomorrow.",
      action: "Open your Session",
    };
  }
  if (kind === "SESSION_REMINDER_1H") {
    return {
      subjectPrefix: "Your Quipsly Session starts soon",
      headline: "Your Session starts in about an hour.",
      action: "Open your Session",
    };
  }
  return {
    subjectPrefix: "Your Quipsly Session is scheduled",
    headline: "Your Session is on the calendar.",
    action: "View your Session",
  };
}

export async function sendTransactionalEmail(input: {
  recipientEmail: string;
  recipientName?: string | null;
  counterpartName?: string | null;
  roomId: string;
  roomTitle: string;
  scheduledStart: Date;
  timezone: string;
  kind: TransactionalEmailKind;
  idempotencyKey: string;
}): Promise<TransactionalEmailSendResult> {
  const recipientEmail = normalizeEmail(input.recipientEmail);
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return {
      ok: false,
      provider: "resend",
      code: "INVALID_RECIPIENT",
      message: "The transactional email recipient is invalid.",
      retryAfterSeconds: null,
    };
  }
  if (recipientEmail.endsWith("@dev.test")) {
    return {
      ok: false,
      provider: "resend",
      code: "LOCAL_TEST_RECIPIENT",
      message: "Quipsly kept this synthetic email inside the local acceptance environment.",
      retryAfterSeconds: null,
    };
  }
  const readiness = transactionalEmailReadiness();
  if (!readiness.available) {
    return {
      ok: false,
      provider: "resend",
      code: readiness.status,
      message:
        readiness.status === "PUBLIC_URL_NOT_CONFIGURED"
          ? "Quipsly needs a trusted public URL before it can send Session email."
          : "Transactional email delivery is not configured.",
      retryAfterSeconds: null,
    };
  }
  const sessionUrl = transactionalSessionUrl(input.roomId);
  if (!sessionUrl) {
    return {
      ok: false,
      provider: "resend",
      code: "INVALID_SESSION_URL",
      message: "Quipsly refused to send an invalid Session URL.",
      retryAfterSeconds: null,
    };
  }

  const recipient = compact(input.recipientName, 120) || "there";
  const counterpart = compact(input.counterpartName, 120);
  const title = compact(input.roomTitle, 180) || "Coaching Session";
  const scheduled = sessionTime({
    scheduledStart: input.scheduledStart,
    timezone: input.timezone,
  });
  const copy = copyForKind(input.kind);
  const subject = `${copy.subjectPrefix}: ${title}`;
  const participantLine = counterpart
    ? `You’ll meet with ${counterpart}.`
    : "Your shared Session workspace is ready.";
  const text = [
    `Hi ${recipient},`,
    "",
    copy.headline,
    participantLine,
    `Session: ${title}`,
    `When: ${scheduled}`,
    "",
    `${copy.action}:`,
    sessionUrl.toString(),
    "",
    "Quipsly works in a browser on your phone, tablet, or desktop. You can check your camera and microphone before joining; opening the Session never starts recording.",
    "",
    "This is an operational message about a Session you are part of.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(recipient)},</p><p><strong>${escapeHtml(copy.headline)}</strong> ${escapeHtml(participantLine)}</p><p><strong>Session:</strong> ${escapeHtml(title)}<br><strong>When:</strong> ${escapeHtml(scheduled)}</p><p><a href="${escapeHtml(sessionUrl.toString())}">${escapeHtml(copy.action)}</a></p><p>Quipsly works in a browser on your phone, tablet, or desktop. You can check your camera and microphone before joining; opening the Session never starts recording.</p><p><small>This is an operational message about a Session you are part of.</small></p>`;

  const apiKey =
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY!.trim();
  const from =
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM?.trim() ||
    process.env.HGO_EMAIL_FROM!.trim();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey.slice(0, 256),
        "user-agent": "Quipsly/1.0 transactional-email",
      },
      body: JSON.stringify({ from, to: [recipientEmail], subject, text, html }),
      cache: "no-store",
    });
    const raw = await response.text();
    let packet: { id?: unknown; message?: unknown } = {};
    try {
      packet = raw ? JSON.parse(raw) : {};
    } catch {
      packet = {};
    }
    if (response.ok && typeof packet.id === "string" && packet.id.trim()) {
      return {
        ok: true,
        provider: "resend",
        providerMessageId: packet.id.trim(),
      };
    }
    const rateLimited = response.status === 429;
    return {
      ok: false,
      provider: "resend",
      code: rateLimited ? "RATE_LIMITED" : "PROVIDER_REJECTED",
      message: rateLimited
        ? "Transactional email is temporarily rate limited."
        : `Transactional email was rejected${compact(packet.message) ? `: ${compact(packet.message)}` : "."}`,
      retryAfterSeconds: retryAfter(response),
    };
  } catch {
    return {
      ok: false,
      provider: "resend",
      code: "PROVIDER_UNAVAILABLE",
      message: "Quipsly could not reach the email provider.",
      retryAfterSeconds: null,
    };
  }
}
