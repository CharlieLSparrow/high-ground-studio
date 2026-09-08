export function conversationWorkSourceHref(engagementId: string | null | undefined, sourceJson: unknown): string | null {
  if (!engagementId || !sourceJson || typeof sourceJson !== "object" || Array.isArray(sourceJson)) return null;
  const source = (sourceJson as Record<string, unknown>).conversationSource;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = source as Record<string, unknown>;
  if (value.schema !== "quipsly-conversation-work-v1" || value.engagementId !== engagementId
    || typeof value.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,240}$/.test(value.messageId)) return null;
  return `/coaching/engagements/${encodeURIComponent(engagementId)}?message=${encodeURIComponent(value.messageId)}#relationship-conversation`;
}
