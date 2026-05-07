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

function formatSupportType(value: string) {
  switch (value) {
    case "NEED_LODGING":
      return "Needs help finding lodging";
    case "OFFER_LODGING_HELP":
      return "May be able to help with lodging";
    case "OTHER_SUPPORT":
      return "Other support";
    default:
      return value.replace(/_/g, " ");
  }
}

function buildSupportPageUrl(siteUrl: string) {
  return `${siteUrl.replace(/\/$/, "")}/support/company-family`;
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

export async function notifyTeamOfCompanySupportRequest({
  requestId,
  name,
  email,
  phone,
  preferredContactMethod,
  supportType,
  note,
  createdAt,
}: {
  requestId: string;
  name: string;
  email: string;
  phone?: string | null;
  preferredContactMethod: string;
  supportType: string;
  note?: string | null;
  createdAt: Date;
}): Promise<EmailResult> {
  const siteUrl = process.env.HGO_SITE_URL?.trim() ?? "";

  if (!siteUrl) {
    return { ok: false, error: "HGO_SITE_URL is not configured" };
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
      .map((recipient) => recipient.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (recipients.length === 0) {
    return { ok: false, error: "No company support notification recipients found" };
  }

  const supportPageUrl = buildSupportPageUrl(siteUrl);
  const formattedCreatedAt = formatCreatedDate(createdAt);
  const noteSection = note?.trim()
    ? `\nNote:\n${note.trim()}\n`
    : "";

  const subject = "New company support request";
  const text = [
    "New company support request",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone?.trim() || "not provided"}`,
    `Preferred contact: ${formatPreferredContactMethod(preferredContactMethod)}`,
    `Support type: ${formatSupportType(supportType)}`,
    `Submitted: ${formattedCreatedAt}`,
    `Request ID: ${requestId}`,
    noteSection ? noteSection.trimEnd() : "",
    `View page: ${supportPageUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #172126;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">New company support request</h1>
      <p style="margin: 0 0 16px;">A new lodging or support note was submitted through the public company family support page.</p>
      <ul style="padding-left: 20px; margin: 0 0 20px;">
        <li><strong>Name:</strong> ${escapeHtml(name)}</li>
        <li><strong>Email:</strong> ${escapeHtml(email)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone?.trim() || "not provided")}</li>
        <li><strong>Preferred contact:</strong> ${escapeHtml(formatPreferredContactMethod(preferredContactMethod))}</li>
        <li><strong>Support type:</strong> ${escapeHtml(formatSupportType(supportType))}</li>
        <li><strong>Submitted:</strong> ${escapeHtml(formattedCreatedAt)}</li>
        <li><strong>Request ID:</strong> ${escapeHtml(requestId)}</li>
      </ul>
      ${note?.trim() ? `<div style="margin: 0 0 20px;"><strong>Note:</strong><div style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(note.trim())}</div></div>` : ""}
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(supportPageUrl)}" style="display: inline-block; background: #55676f; color: #fff8ee; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">Open support page</a>
      </p>
      <p style="margin: 0; font-size: 14px; color: #5f6b73;">This notification is only sent to internal users with company coordination roles.</p>
    </div>
  `;

  return sendEmail({
    to: recipients,
    subject,
    text,
    html,
  });
}
