import "server-only";

import { RoomServiceClient } from "livekit-server-sdk";

type ProviderGrant = {
  providerIdentity: string;
  expiresAt: Date;
};

export type ParticipantProviderReconciliation = {
  status: "NOT_REQUIRED" | "BLOCKED" | "CONVERGED" | "FAILED";
  errorCode: string | null;
  providerRoomId: string | null;
  identityCount: number;
  removedIdentityCount: number;
  activeIdentityCountAfter: number | null;
  tokenRevocationGuaranteed: boolean;
  latestGrantExpiry: string | null;
  nextAction: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function liveKitServiceURL(value: string) {
  if (value.startsWith("wss://"))
    return `https://${value.slice("wss://".length)}`;
  if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
  return value.replace(/\/+$/, "");
}

function isLiveKitCloud(value: string) {
  try {
    return new URL(value).hostname.endsWith(".livekit.cloud");
  } catch {
    return false;
  }
}

function identitiesForParticipant(participantId: string, values: string[]) {
  const prefix = `${participantId}:`;
  return [
    ...new Set(
      values.filter(
        (identity) => identity === participantId || identity.startsWith(prefix),
      ),
    ),
  ].sort();
}

function latestExpiry(grants: ProviderGrant[]) {
  const value = grants.reduce<number | null>((latest, grant) => {
    const time = grant.expiresAt.getTime();
    return latest === null || time > latest ? time : latest;
  }, null);
  return value === null ? null : new Date(value).toISOString();
}

/**
 * Reconciles provider presence after canonical Quipsly Session access has
 * already been removed. This function never decides authorization and never
 * restores access when the provider is unavailable.
 */
export async function reconcileRemovedParticipantProviderAccess(input: {
  provider: string | null | undefined;
  providerRoomId: string | null | undefined;
  participantId: string;
  grants: ProviderGrant[];
  now?: Date;
}): Promise<ParticipantProviderReconciliation> {
  const provider = text(input.provider).toLowerCase();
  const providerRoomId = text(input.providerRoomId);
  const latestGrantExpiry = latestExpiry(input.grants);
  if (provider !== "livekit" || !providerRoomId) {
    return {
      status: "NOT_REQUIRED",
      errorCode: null,
      providerRoomId: providerRoomId || null,
      identityCount: 0,
      removedIdentityCount: 0,
      activeIdentityCountAfter: 0,
      tokenRevocationGuaranteed: false,
      latestGrantExpiry,
      nextAction:
        "Quipsly Session access is removed. This Session has no active LiveKit provider effect to reconcile.",
    };
  }

  const configuredURL = text(process.env.LIVEKIT_URL);
  const apiKey = text(process.env.LIVEKIT_API_KEY);
  const apiSecret = text(process.env.LIVEKIT_API_SECRET);
  if (!configuredURL || !apiKey || !apiSecret) {
    return {
      status: "BLOCKED",
      errorCode: "LIVEKIT_ADMIN_NOT_CONFIGURED",
      providerRoomId,
      identityCount: input.grants.length,
      removedIdentityCount: 0,
      activeIdentityCountAfter: null,
      tokenRevocationGuaranteed: false,
      latestGrantExpiry,
      nextAction:
        "Quipsly access is removed, but LiveKit admin credentials are unavailable. Reconcile provider presence before treating the participant as disconnected.",
    };
  }

  const serviceURL = liveKitServiceURL(configuredURL);
  const tokenRevocationGuaranteed = isLiveKitCloud(serviceURL);
  const roomService = new RoomServiceClient(serviceURL, apiKey, apiSecret);
  const knownIdentities = identitiesForParticipant(
    input.participantId,
    input.grants.map((grant) => grant.providerIdentity),
  );

  try {
    const activeBefore = await roomService.listParticipants(providerRoomId);
    const activeIdentities = identitiesForParticipant(
      input.participantId,
      activeBefore.map((participant) => participant.identity),
    );
    const identities = [
      ...new Set([...knownIdentities, ...activeIdentities]),
    ].sort();
    const revokeTokenTs = BigInt(
      Math.floor((input.now || new Date()).getTime() / 1000),
    );
    let removedIdentityCount = 0;
    for (const identity of identities) {
      try {
        await roomService.removeParticipant(providerRoomId, identity, {
          revokeTokenTs,
        });
        removedIdentityCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        if (
          !message.includes("participant does not exist") &&
          !message.includes("not found")
        )
          throw error;
      }
    }
    const activeAfter = await roomService.listParticipants(providerRoomId);
    const activeIdentityCountAfter = identitiesForParticipant(
      input.participantId,
      activeAfter.map((participant) => participant.identity),
    ).length;
    if (activeIdentityCountAfter > 0) {
      return {
        status: "FAILED",
        errorCode: "LIVEKIT_PARTICIPANT_STILL_PRESENT",
        providerRoomId,
        identityCount: identities.length,
        removedIdentityCount,
        activeIdentityCountAfter,
        tokenRevocationGuaranteed,
        latestGrantExpiry,
        nextAction:
          "Quipsly access is removed, but LiveKit still reports an active device. Retry provider reconciliation.",
      };
    }
    return {
      status: "CONVERGED",
      errorCode: null,
      providerRoomId,
      identityCount: identities.length,
      removedIdentityCount,
      activeIdentityCountAfter,
      tokenRevocationGuaranteed,
      latestGrantExpiry,
      nextAction: tokenRevocationGuaranteed
        ? "Quipsly access is removed and LiveKit Cloud reports no active device; current participant tokens were revoked."
        : "Quipsly access is removed and LiveKit reports no active device. Self-hosted tokens remain bounded by their recorded expiry.",
    };
  } catch {
    return {
      status: "FAILED",
      errorCode: "LIVEKIT_ADMIN_REQUEST_FAILED",
      providerRoomId,
      identityCount: knownIdentities.length,
      removedIdentityCount: 0,
      activeIdentityCountAfter: null,
      tokenRevocationGuaranteed,
      latestGrantExpiry,
      nextAction:
        "Quipsly access is removed, but provider readback failed. Retry reconciliation before treating the participant as disconnected.",
    };
  }
}
