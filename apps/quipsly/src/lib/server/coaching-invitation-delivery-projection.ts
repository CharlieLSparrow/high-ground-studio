function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function projectClientInvitationDelivery(input: {
  clientEmail: unknown;
  invitations: unknown;
}) {
  const clientEmail = text(input.clientEmail).toLowerCase();
  if (!clientEmail || !Array.isArray(input.invitations)) return null;
  const invitation = input.invitations.find(
    (candidate: any) => text(candidate?.email).toLowerCase() === clientEmail,
  );
  const delivery = invitation?.deliveries?.[0];
  if (!delivery?.id) return null;
  return {
    id: delivery.id,
    channel: text(delivery.channel),
    status: text(delivery.status),
    requestedAt: delivery.requestedAt,
    completedAt: delivery.completedAt || null,
    errorCode: delivery.errorCode || null,
    errorMessage: delivery.errorMessage || null,
  };
}

export function projectClientInvitationDeliveryForViewer(input: {
  canManageInvitation: boolean;
  clientEmail: unknown;
  invitations: unknown;
}) {
  if (!input.canManageInvitation) return null;
  return projectClientInvitationDelivery(input);
}
