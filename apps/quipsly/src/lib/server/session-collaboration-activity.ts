import "server-only";

type InvitationRecord = {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
  createdBy?: { name?: string | null; primaryEmail?: string | null } | null;
  acceptedBy?: { name?: string | null; primaryEmail?: string | null } | null;
};

type AccessReceiptRecord = {
  id: string;
  action: string;
  providerStatus: string;
  createdAt: Date;
  actor?: { name?: string | null; primaryEmail?: string | null } | null;
  participant: { displayName?: string | null; email?: string | null };
};

type ProviderGrantRecord = {
  id: string;
  participantId: string;
  clientInstanceId?: string | null;
  clientKind: string;
  deviceLabel?: string | null;
  issuedAt: Date;
  expiresAt: Date;
  participant: { displayName?: string | null; email?: string | null };
};

export type SessionCollaborationActivityItem = {
  id: string;
  kind:
    | "INVITATION_CREATED"
    | "INVITATION_ACCEPTED"
    | "INVITATION_REVOKED"
    | "INVITATION_EXPIRED"
    | "PARTICIPANT_REMOVED"
    | "PARTICIPANT_RESTORED"
    | "PROVIDER_RECONCILIATION";
  tone: "neutral" | "positive" | "warning";
  title: string;
  detail: string;
  participantLabel: string;
  actorLabel: string | null;
  occurredAt: string;
  providerStatus: string | null;
};

export type SessionJoinKeyLease = {
  id: string;
  participantId: string;
  participantLabel: string;
  clientKind: string;
  deviceLabel: string;
  issuedAt: string;
  expiresAt: string;
};

function personLabel(
  value:
    | { name?: string | null; primaryEmail?: string | null }
    | null
    | undefined,
) {
  return value?.name?.trim() || value?.primaryEmail?.trim() || null;
}

function participantLabel(value: {
  displayName?: string | null;
  email?: string | null;
}) {
  return (
    value.displayName?.trim() || value.email?.trim() || "Session participant"
  );
}

function invitationParticipantLabel(value: InvitationRecord) {
  return value.displayName?.trim() || value.email.trim();
}

function providerDetail(status: string) {
  if (status === "CONVERGED")
    return "Provider readback found no matching active device. Historical consent, media, transcript, chat, and authored work remain preserved.";
  if (status === "NOT_REQUIRED")
    return "No provider effect was required. Historical consent, media, transcript, chat, and authored work remain preserved.";
  if (status === "BLOCKED")
    return "Canonical Quipsly access remains removed, but provider administration is unavailable. Reconciliation is still required.";
  if (status === "FAILED")
    return "Canonical Quipsly access remains removed, but provider readback failed. Reconciliation is still required.";
  return "Provider reconciliation was requested after canonical Quipsly access was removed.";
}

export function projectSessionCollaborationActivity(input: {
  invitations: InvitationRecord[];
  accessReceipts: AccessReceiptRecord[];
  providerGrants: ProviderGrantRecord[];
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const activity: SessionCollaborationActivityItem[] = [];

  for (const invitation of input.invitations) {
    const label = invitationParticipantLabel(invitation);
    activity.push({
      id: `invitation-created:${invitation.id}`,
      kind: "INVITATION_CREATED",
      tone: "neutral",
      title: "Private Session link created",
      detail: `${label} was invited as ${invitation.role.toLowerCase()}. The link grants only this Session and Quipsly did not send it automatically.`,
      participantLabel: label,
      actorLabel: personLabel(invitation.createdBy),
      occurredAt: invitation.createdAt.toISOString(),
      providerStatus: null,
    });
    if (invitation.acceptedAt) {
      activity.push({
        id: `invitation-accepted:${invitation.id}`,
        kind: "INVITATION_ACCEPTED",
        tone: "positive",
        title: "Session access accepted",
        detail: `${label} accepted with the exact invited account. Acceptance did not grant access to the surrounding Nest or start media.`,
        participantLabel: label,
        actorLabel: personLabel(invitation.acceptedBy),
        occurredAt: invitation.acceptedAt.toISOString(),
        providerStatus: null,
      });
    } else if (invitation.revokedAt) {
      activity.push({
        id: `invitation-revoked:${invitation.id}`,
        kind: "INVITATION_REVOKED",
        tone: "warning",
        title: "Unused Session link revoked",
        detail: `${label} can no longer accept this link. No participant access or provider connection was removed.`,
        participantLabel: label,
        actorLabel: personLabel(invitation.createdBy),
        occurredAt: invitation.revokedAt.toISOString(),
        providerStatus: null,
      });
    } else if (
      invitation.status === "PENDING" &&
      invitation.expiresAt.getTime() <= now.getTime()
    ) {
      activity.push({
        id: `invitation-expired:${invitation.id}`,
        kind: "INVITATION_EXPIRED",
        tone: "warning",
        title: "Unused Session link expired",
        detail: `${label} can no longer accept this link. No participant access or provider connection was removed.`,
        participantLabel: label,
        actorLabel: null,
        occurredAt: invitation.expiresAt.toISOString(),
        providerStatus: null,
      });
    }
  }

  for (const receipt of input.accessReceipts) {
    const label = participantLabel(receipt.participant);
    if (receipt.action === "REMOVE") {
      activity.push({
        id: `access:${receipt.id}`,
        kind: "PARTICIPANT_REMOVED",
        tone: "warning",
        title: "Session access removed",
        detail:
          "Canonical access was removed before provider reconciliation. Historical consent, media, transcript, chat, and authored work were not deleted.",
        participantLabel: label,
        actorLabel: personLabel(receipt.actor),
        occurredAt: receipt.createdAt.toISOString(),
        providerStatus: receipt.providerStatus,
      });
    } else if (receipt.action === "RESTORE") {
      activity.push({
        id: `access:${receipt.id}`,
        kind: "PARTICIPANT_RESTORED",
        tone: "positive",
        title: "Session access restored",
        detail:
          "Authorization was restored after provider reconciliation. No media was joined, message sent, or recording started.",
        participantLabel: label,
        actorLabel: personLabel(receipt.actor),
        occurredAt: receipt.createdAt.toISOString(),
        providerStatus: receipt.providerStatus,
      });
    } else if (receipt.action === "PROVIDER_RECONCILE") {
      activity.push({
        id: `access:${receipt.id}`,
        kind: "PROVIDER_RECONCILIATION",
        tone:
          receipt.providerStatus === "CONVERGED" ||
          receipt.providerStatus === "NOT_REQUIRED"
            ? "positive"
            : "warning",
        title:
          receipt.providerStatus === "CONVERGED" ||
          receipt.providerStatus === "NOT_REQUIRED"
            ? "Provider access reconciled"
            : "Provider reconciliation needs attention",
        detail: providerDetail(receipt.providerStatus),
        participantLabel: label,
        actorLabel: personLabel(receipt.actor),
        occurredAt: receipt.createdAt.toISOString(),
        providerStatus: receipt.providerStatus,
      });
    }
  }

  activity.sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.id.localeCompare(right.id),
  );

  const latestLeaseByDevice = new Map<string, ProviderGrantRecord>();
  for (const grant of input.providerGrants) {
    if (grant.expiresAt.getTime() <= now.getTime()) continue;
    const deviceKey = `${grant.participantId}:${grant.clientInstanceId || grant.clientKind}`;
    const current = latestLeaseByDevice.get(deviceKey);
    if (!current || current.issuedAt.getTime() < grant.issuedAt.getTime())
      latestLeaseByDevice.set(deviceKey, grant);
  }
  const joinKeyLeases: SessionJoinKeyLease[] = [...latestLeaseByDevice.values()]
    .sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime())
    .map((grant) => ({
      id: grant.id,
      participantId: grant.participantId,
      participantLabel: participantLabel(grant.participant),
      clientKind: grant.clientKind,
      deviceLabel:
        grant.deviceLabel?.trim() ||
        (grant.clientKind === "ios" ? "Quipsly Capture" : "Quipsly Web"),
      issuedAt: grant.issuedAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
    }));

  return {
    activity: activity.slice(0, Math.max(1, Math.min(input.limit ?? 50, 100))),
    joinKeyLeases,
    boundaries: {
      appendOnlyAccessHistory: true,
      joinKeyLeaseIsPresenceProof: false,
      providerIdentitiesExposed: false,
      credentialsExposed: false,
    },
  };
}
