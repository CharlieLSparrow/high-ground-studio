import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail, type EmailResult } from "@/lib/server/email";

function formatPreferredContactMethod(value: string) {
  switch (value) {
    case "EMAIL":
      return "Email";
    case "PHONE_CALL":
      return "Phone call";
    case "TEXT":
      return "Text";
    default:
      return value.replace(/_/g, " ");
  }
}

function buildQueueUrl(siteUrl: string) {
  return `${siteUrl.replace(/\/$/, "")}/team/coaching-requests`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCreatedDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
    timeZoneName: "short",
  }).format(value);
}

export async function notifyTeamOfNewCoachingRequest({
  requestId,
  clientDisplayName,
  clientEmail,
  preferredContactMethod,
  phone,
  note,
  createdAt,
}: {
  requestId: string;
  clientDisplayName: string;
  clientEmail: string;
  preferredContactMethod: string;
  phone?: string | null;
  note?: string | null;
  createdAt: Date;
}): Promise<EmailResult> {
  const siteUrl = process.env.HGO_SITE_URL?.trim() ?? "";

  if (!siteUrl) {
    return { ok: false, error: "Email notification env vars are not configured" };
  }

  const recipientUsers = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: {
            in: ["OWNER", "TEAM_SCHEDULER", "COACH"],
          },
        },
      },
      isActive: true,
    },
    select: {
      primaryEmail: true,
      aliases: {
        select: {
          email: true,
        },
      },
    },
  });

  const recipients = [...new Set(
    recipientUsers
      .flatMap((user) => [user.primaryEmail, ...user.aliases.map((alias) => alias.email)])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (recipients.length === 0) {
    return { ok: false, error: "No coaching notification recipients found" };
  }

  const queueUrl = buildQueueUrl(siteUrl);
  const formattedCreatedAt = formatCreatedDate(createdAt);
  const noteSection = note?.trim()
    ? `\nClient note:\n${note.trim()}\n`
    : "";

  const subject = "New High Ground coaching request";
  const text = [
    "New High Ground coaching request",
    "",
    `Client: ${clientDisplayName}`,
    `Email: ${clientEmail}`,
    `Preferred contact: ${formatPreferredContactMethod(preferredContactMethod)}`,
    `Phone: ${phone?.trim() || "not provided"}`,
    `Submitted: ${formattedCreatedAt}`,
    `Request ID: ${requestId}`,
    noteSection ? `${noteSection.trimEnd()}` : "",
    `View queue: ${queueUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #172126;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">New High Ground coaching request</h1>
      <p style="margin: 0 0 16px;">A new coaching request was submitted and is ready for follow-up.</p>
      <ul style="padding-left: 20px; margin: 0 0 20px;">
        <li><strong>Client:</strong> ${escapeHtml(clientDisplayName)}</li>
        <li><strong>Email:</strong> ${escapeHtml(clientEmail)}</li>
        <li><strong>Preferred contact:</strong> ${escapeHtml(formatPreferredContactMethod(preferredContactMethod))}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone?.trim() || "not provided")}</li>
        <li><strong>Submitted:</strong> ${escapeHtml(formattedCreatedAt)}</li>
        <li><strong>Request ID:</strong> ${escapeHtml(requestId)}</li>
      </ul>
      ${note?.trim() ? `<div style="margin: 0 0 20px;"><strong>Client note:</strong><div style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(note.trim())}</div></div>` : ""}
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(queueUrl)}" style="display: inline-block; background: #cb6b2d; color: #fff8ee; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">Open coaching requests</a>
      </p>
      <p style="margin: 0; font-size: 14px; color: #5f6b73;">This notification is only sent to internal users with coaching or scheduling rights.</p>
    </div>
  `;

  return sendEmail({
    to: recipients,
    subject,
    text,
    html,
  });
}
