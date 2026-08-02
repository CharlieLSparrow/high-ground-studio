import "server-only";

export type AccountDeletionEmailConfiguration = {
  apiKeyConfigured: boolean;
  fromConfigured: boolean;
  fromValid: boolean;
  fromDomain: string | null;
};

const EMAIL_MAILBOX_PATTERN = /^[^<>\s@]+@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i;

function senderMailbox(value: string) {
  if (/[\r\n]/.test(value)) return null;
  const trimmed = value.trim();
  const angleAddress = trimmed.match(/^[^<>]+<([^<>]+)>$/)?.[1]?.trim();
  const mailbox = angleAddress ?? trimmed;
  const match = mailbox.match(EMAIL_MAILBOX_PATTERN);
  return match ? { mailbox, domain: match[1].toLowerCase() } : null;
}

export function accountDeletionEmailConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AccountDeletionEmailConfiguration {
  const apiKey = environment.QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY?.trim();
  const from = environment.QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM?.trim();
  const sender = from ? senderMailbox(from) : null;
  return {
    apiKeyConfigured: Boolean(apiKey),
    fromConfigured: Boolean(from),
    fromValid: Boolean(sender),
    fromDomain: sender?.domain ?? null,
  };
}
