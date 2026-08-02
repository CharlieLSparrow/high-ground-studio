import "server-only";

import {
  cancelGoogleCalendarProjection,
  SessionCalendarProjectionError,
  type SessionCalendarProjectionPreview,
  writeGoogleCalendarProjection,
} from "@/lib/server/google-calendar-session-projection";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarOAuthError,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";

export type GoogleCalendarProjectionContext = {
  source: { id: string };
  collection: {
    id: string;
    connectionId: string | null;
    providerCalendarId: string;
    connection: { oauthCredential?: { encryptedPayload: string } | null };
  };
  preview: SessionCalendarProjectionPreview;
};

export class GoogleCalendarProjectionOperationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly providerWriteAttempted: boolean,
    readonly externalSideEffects: boolean | "unknown",
    readonly nextAction?: string,
    readonly projectionId?: string,
    readonly receiptId?: string,
  ) {
    super(message);
    this.name = "GoogleCalendarProjectionOperationError";
  }
}

function projectionIdentity(context: GoogleCalendarProjectionContext) {
  return {
    collectionId_sourceType_sourceId: {
      collectionId: context.collection.id,
      sourceType: context.preview.snapshot.sourceType,
      sourceId: context.source.id,
    },
  };
}

function projectionMetadata(input: {
  schema: string;
  recoveredCreate?: boolean;
  cancellationConfirmed?: boolean;
  providerAlreadyAbsent?: boolean;
  conflict?: Record<string, unknown>;
}) {
  return {
    schema: input.schema,
    sendUpdates: "none",
    attendeesIncluded: false,
    ...(input.recoveredCreate === undefined ? {} : { recoveredCreate: input.recoveredCreate }),
    ...(input.cancellationConfirmed === undefined ? {} : { cancellationConfirmed: input.cancellationConfirmed }),
    ...(input.providerAlreadyAbsent === undefined ? {} : { providerAlreadyAbsent: input.providerAlreadyAbsent }),
    ...(input.conflict || {}),
  };
}

async function accessToken(input: {
  context: GoogleCalendarProjectionContext;
  requestUrl: string;
}) {
  const credential = input.context.collection.connection.oauthCredential;
  if (!credential?.encryptedPayload) {
    throw new SessionCalendarProjectionError(
      "Reconnect Google Calendar before changing this event.",
      "missing-encrypted-credential",
      409,
    );
  }
  try {
    const config = getGoogleCalendarOAuthConfig(input.requestUrl);
    const refreshToken = decryptGoogleRefreshToken(
      credential.encryptedPayload,
      config.encryptionKey,
    );
    return await refreshGoogleCalendarAccess({ refreshToken, config });
  } catch (error) {
    if (error instanceof GoogleCalendarOAuthError) {
      throw new SessionCalendarProjectionError(
        error.message,
        error.code,
        error.status,
      );
    }
    throw error;
  }
}

async function persistProviderConflict(input: {
  prisma: any;
  context: GoogleCalendarProjectionContext;
  actorUserId: string;
  operation: "UPDATE_EVENT" | "CANCEL_EVENT";
  receiptSchema: string;
  providerStatus: string;
}) {
  const projectionId = input.context.preview.existing?.projectionId;
  if (!projectionId) return;
  await input.prisma.$transaction(async (transaction: any) => {
    await transaction.calendarProjection.update({
      where: { id: projectionId },
      data: { status: "CONFLICT", conflictState: "EXTERNAL_CHANGED" },
    });
    await transaction.calendarSyncReceipt.create({
      data: {
        connectionId: input.context.collection.connectionId,
        collectionId: input.context.collection.id,
        projectionId,
        actorUserId: input.actorUserId,
        operation: input.operation,
        outcome: "CONFLICT",
        requestDigest: input.context.preview.sourceRevision,
        providerStatus: input.providerStatus,
        externalMutated: false,
        metadataJson: projectionMetadata({
          schema: input.receiptSchema,
          conflict: {
            lostProviderUpdatePrevented: input.operation === "UPDATE_EVENT",
            lostProviderDeletePrevented: input.operation === "CANCEL_EVENT",
          },
        }),
      },
    });
  });
}

async function persistSourceChangedConflict(input: {
  prisma: any;
  before: GoogleCalendarProjectionContext;
  after: GoogleCalendarProjectionContext;
  actorUserId: string;
  operation: "CREATE_EVENT" | "UPDATE_EVENT" | "CANCEL_EVENT";
  projectionSchema: string;
  receiptSchema: string;
  provider: {
    providerEventId: string | null;
    providerEtag: string | null;
    providerStatus: string;
    externalMutated: boolean;
    providerAlreadyAbsent?: boolean;
  };
}) {
  const occurredAt = new Date();
  return input.prisma.$transaction(async (transaction: any) => {
    const projection = await transaction.calendarProjection.upsert({
      where: projectionIdentity(input.before),
      create: {
        collectionId: input.before.collection.id,
        sourceType: input.before.preview.snapshot.sourceType,
        sourceId: input.before.source.id,
        sourceRevision: input.before.preview.sourceRevision,
        providerEventId: input.provider.providerEventId,
        providerEtag: input.provider.providerEtag,
        uid: input.before.preview.uid,
        status: "CONFLICT",
        conflictState: "QUIPSLY_CHANGED",
        lastSyncedAt: occurredAt,
        metadataJson: projectionMetadata({
          schema: input.projectionSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: {
            sourceChangedAfterProviderEffect: true,
            observedCurrentSourceRevision: input.after.preview.sourceRevision,
          },
        }),
      },
      update: {
        sourceRevision: input.before.preview.sourceRevision,
        providerEventId: input.provider.providerEventId,
        providerEtag: input.provider.providerEtag,
        sequence: { increment: input.provider.externalMutated ? 1 : 0 },
        status: "CONFLICT",
        conflictState: "QUIPSLY_CHANGED",
        lastSyncedAt: occurredAt,
        metadataJson: projectionMetadata({
          schema: input.projectionSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: {
            sourceChangedAfterProviderEffect: true,
            observedCurrentSourceRevision: input.after.preview.sourceRevision,
          },
        }),
      },
    });
    const receipt = await transaction.calendarSyncReceipt.create({
      data: {
        connectionId: input.before.collection.connectionId,
        collectionId: input.before.collection.id,
        projectionId: projection.id,
        actorUserId: input.actorUserId,
        operation: input.operation,
        outcome: "CONFLICT",
        requestDigest: input.before.preview.sourceRevision,
        responseDigest: input.provider.providerEtag || input.provider.providerEventId || input.provider.providerStatus,
        providerStatus: input.provider.providerStatus,
        externalMutated: input.provider.externalMutated,
        occurredAt,
        metadataJson: projectionMetadata({
          schema: input.receiptSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: {
            sourceChangedAfterProviderEffect: true,
            observedCurrentSourceRevision: input.after.preview.sourceRevision,
          },
        }),
      },
    });
    return { projection, receipt };
  });
}

async function persistPostProviderVerificationConflict(input: {
  prisma: any;
  before: GoogleCalendarProjectionContext;
  actorUserId: string;
  operation: "CREATE_EVENT" | "UPDATE_EVENT" | "CANCEL_EVENT";
  projectionSchema: string;
  receiptSchema: string;
  provider: {
    providerEventId: string | null;
    providerEtag: string | null;
    providerStatus: string;
    externalMutated: boolean;
    providerAlreadyAbsent?: boolean;
  };
}) {
  const occurredAt = new Date();
  return input.prisma.$transaction(async (transaction: any) => {
    const projection = await transaction.calendarProjection.upsert({
      where: projectionIdentity(input.before),
      create: {
        collectionId: input.before.collection.id,
        sourceType: input.before.preview.snapshot.sourceType,
        sourceId: input.before.source.id,
        sourceRevision: input.before.preview.sourceRevision,
        providerEventId: input.provider.providerEventId,
        providerEtag: input.provider.providerEtag,
        uid: input.before.preview.uid,
        status: "CONFLICT",
        conflictState: "QUIPSLY_CHANGED",
        lastSyncedAt: occurredAt,
        metadataJson: projectionMetadata({
          schema: input.projectionSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: { postProviderVerificationFailed: true },
        }),
      },
      update: {
        sourceRevision: input.before.preview.sourceRevision,
        providerEventId: input.provider.providerEventId,
        providerEtag: input.provider.providerEtag,
        sequence: { increment: input.provider.externalMutated ? 1 : 0 },
        status: "CONFLICT",
        conflictState: "QUIPSLY_CHANGED",
        lastSyncedAt: occurredAt,
        metadataJson: projectionMetadata({
          schema: input.projectionSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: { postProviderVerificationFailed: true },
        }),
      },
    });
    const receipt = await transaction.calendarSyncReceipt.create({
      data: {
        connectionId: input.before.collection.connectionId,
        collectionId: input.before.collection.id,
        projectionId: projection.id,
        actorUserId: input.actorUserId,
        operation: input.operation,
        outcome: "CONFLICT",
        requestDigest: input.before.preview.sourceRevision,
        responseDigest: input.provider.providerEtag
          || input.provider.providerEventId
          || input.provider.providerStatus,
        providerStatus: input.provider.providerStatus,
        externalMutated: input.provider.externalMutated,
        occurredAt,
        metadataJson: projectionMetadata({
          schema: input.receiptSchema,
          cancellationConfirmed: input.operation === "CANCEL_EVENT",
          providerAlreadyAbsent: input.provider.providerAlreadyAbsent,
          conflict: { postProviderVerificationFailed: true },
        }),
      },
    });
    return { projection, receipt };
  });
}

export async function synchronizeGoogleCalendarProjection(input: {
  prisma: any;
  requestUrl: string;
  actorUserId: string;
  current: GoogleCalendarProjectionContext;
  reload: () => Promise<GoogleCalendarProjectionContext>;
  projectionSchema: string;
  receiptSchema: string;
}) {
  if (input.current.preview.snapshot.status === "CANCELLED") {
    throw new GoogleCalendarProjectionOperationError(
      input.current.preview.warning,
      "cancellation-requires-separate-action",
      409,
      false,
      false,
    );
  }

  let providerWriteAttempted = false;
  let providerExternalMutated: boolean | null = null;
  try {
    const token = input.current.preview.action === "NOOP"
      ? ""
      : await accessToken({ context: input.current, requestUrl: input.requestUrl });
    providerWriteAttempted = ["CREATE", "UPDATE"].includes(input.current.preview.action);
    const provider = await writeGoogleCalendarProjection({
      preview: input.current.preview,
      accessToken: token,
      calendarId: input.current.collection.providerCalendarId,
    });
    providerExternalMutated = provider.externalMutated;
    const operation = input.current.preview.action === "CREATE"
      ? "CREATE_EVENT" as const
      : input.current.preview.action === "UPDATE"
        ? "UPDATE_EVENT" as const
        : "READ_EVENT" as const;
    let after: GoogleCalendarProjectionContext;
    try {
      after = await input.reload();
    } catch (reloadError) {
      if (!providerWriteAttempted) throw reloadError;
      let conflict: { projection: { id: string }; receipt: { id: string } };
      try {
        conflict = await persistPostProviderVerificationConflict({
          prisma: input.prisma,
          before: input.current,
          actorUserId: input.actorUserId,
          operation: operation === "READ_EVENT" ? "UPDATE_EVENT" : operation,
          projectionSchema: input.projectionSchema,
          receiptSchema: input.receiptSchema,
          provider,
        });
      } catch (receiptError) {
        console.error("[calendar-projection] Could not persist the post-provider verification receipt.", receiptError);
        throw new GoogleCalendarProjectionOperationError(
          "Google accepted the event, but Quipsly could not save its verification receipt. Retry this exact preview after storage recovers.",
          "post-provider-receipt-failed",
          503,
          true,
          provider.externalMutated,
        );
      }
      throw new GoogleCalendarProjectionOperationError(
        "Google accepted the event, but Quipsly source authority or truth changed before the result could be verified. Review the recorded conflict.",
        "post-provider-verification-failed",
        409,
        true,
        provider.externalMutated,
        undefined,
        conflict.projection.id,
        conflict.receipt.id,
      );
    }
    if (after.preview.sourceRevision !== input.current.preview.sourceRevision) {
      if (operation === "READ_EVENT") {
        throw new GoogleCalendarProjectionOperationError(
          "The Quipsly source changed while its no-change result was being verified. Preview it again.",
          "stale-source-preview",
          409,
          false,
          false,
        );
      }
      const conflict = await persistSourceChangedConflict({
        prisma: input.prisma,
        before: input.current,
        after,
        actorUserId: input.actorUserId,
        operation,
        projectionSchema: input.projectionSchema,
        receiptSchema: input.receiptSchema,
        provider,
      });
      throw new GoogleCalendarProjectionOperationError(
        "Google accepted the event, but Quipsly changed during the operation. Review the recorded conflict before projecting again.",
        "source-changed-after-provider-effect",
        409,
        providerWriteAttempted,
        provider.externalMutated,
        undefined,
        conflict.projection.id,
        conflict.receipt.id,
      );
    }
    const occurredAt = new Date();
    const providerUpdatedAt = provider.providerUpdatedAt ? new Date(provider.providerUpdatedAt) : null;
    const persisted = await input.prisma.$transaction(async (transaction: any) => {
      const projection = await transaction.calendarProjection.upsert({
        where: projectionIdentity(input.current),
        create: {
          collectionId: input.current.collection.id,
          sourceType: input.current.preview.snapshot.sourceType,
          sourceId: input.current.source.id,
          sourceRevision: input.current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: provider.providerEtag,
          providerUpdatedAt,
          uid: input.current.preview.uid,
          status: "SYNCED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: projectionMetadata({ schema: input.projectionSchema, recoveredCreate: provider.recoveredCreate }),
        },
        update: {
          sourceRevision: input.current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: provider.providerEtag,
          providerUpdatedAt,
          sequence: { increment: provider.externalMutated ? 1 : 0 },
          status: "SYNCED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: projectionMetadata({ schema: input.projectionSchema, recoveredCreate: provider.recoveredCreate }),
        },
      });
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: input.current.collection.connectionId,
          collectionId: input.current.collection.id,
          projectionId: projection.id,
          actorUserId: input.actorUserId,
          operation,
          outcome: provider.outcome === "NOOP" ? "SKIPPED" : "SUCCEEDED",
          requestDigest: input.current.preview.sourceRevision,
          responseDigest: provider.providerEtag || provider.providerEventId,
          providerStatus: provider.recoveredCreate ? "recovered-create" : provider.providerStatus,
          externalMutated: provider.externalMutated,
          occurredAt,
          metadataJson: projectionMetadata({ schema: input.receiptSchema, recoveredCreate: provider.recoveredCreate }),
        },
      });
      return { projection, receipt };
    });
    return {
      projectionId: persisted.projection.id,
      receiptId: persisted.receipt.id,
      sourceRevision: input.current.preview.sourceRevision,
      action: input.current.preview.action,
      externalMutated: provider.externalMutated,
      recoveredCreate: provider.recoveredCreate,
    };
  } catch (error) {
    if (error instanceof GoogleCalendarProjectionOperationError) throw error;
    if (
      error instanceof SessionCalendarProjectionError
      && error.code === "provider-etag-conflict"
    ) {
      await persistProviderConflict({
        prisma: input.prisma,
        context: input.current,
        actorUserId: input.actorUserId,
        operation: "UPDATE_EVENT",
        receiptSchema: input.receiptSchema,
        providerStatus: "etag-conflict",
      }).catch((receiptError) => {
        console.error("[calendar-projection] Could not persist provider update conflict.", receiptError);
      });
    }
    const known = error instanceof SessionCalendarProjectionError;
    throw new GoogleCalendarProjectionOperationError(
      known ? error.message : "The Google Calendar event could not be synchronized safely.",
      known ? error.code : "provider-sync-failed",
      known ? error.status : 503,
      providerWriteAttempted,
      providerExternalMutated === true
        ? true
        : providerWriteAttempted && providerExternalMutated === null
          ? "unknown"
          : false,
      providerWriteAttempted && providerExternalMutated === null
        ? "Retry the same preview. Quipsly will recover the deterministic event instead of creating a duplicate."
        : undefined,
    );
  }
}

export async function cancelGoogleCalendarProjectionOperation(input: {
  prisma: any;
  requestUrl: string;
  actorUserId: string;
  current: GoogleCalendarProjectionContext;
  reload: () => Promise<GoogleCalendarProjectionContext>;
  projectionSchema: string;
  receiptSchema: string;
}) {
  if (input.current.preview.snapshot.status !== "CANCELLED") {
    throw new GoogleCalendarProjectionOperationError(
      "Cancel the Quipsly source before removing its projected Google event.",
      "source-not-cancelled",
      409,
      false,
      false,
    );
  }
  if (input.current.preview.action === "NOOP" && input.current.preview.existing?.status === "CANCELED") {
    const priorReceipt = await input.prisma.calendarSyncReceipt.findFirst({
      where: {
        connectionId: input.current.collection.connectionId,
        collectionId: input.current.collection.id,
        projectionId: input.current.preview.existing.projectionId,
        operation: "CANCEL_EVENT",
        requestDigest: input.current.preview.sourceRevision,
        outcome: { in: ["SUCCEEDED", "SKIPPED"] },
      },
      orderBy: { occurredAt: "desc" },
      select: { id: true, externalMutated: true, providerStatus: true, metadataJson: true },
    });
    if (priorReceipt) {
      const metadata = priorReceipt.metadataJson && typeof priorReceipt.metadataJson === "object"
        ? priorReceipt.metadataJson as Record<string, unknown>
        : {};
      return {
        projectionId: input.current.preview.existing.projectionId,
        receiptId: priorReceipt.id,
        sourceRevision: input.current.preview.sourceRevision,
        action: "CANCEL" as const,
        externalMutated: priorReceipt.externalMutated,
        providerAlreadyAbsent: metadata.providerAlreadyAbsent === true,
        idempotentReplay: true,
        providerStatus: priorReceipt.providerStatus,
      };
    }
  }

  let providerWriteAttempted = false;
  let providerExternalMutated: boolean | null = null;
  try {
    const token = input.current.preview.action === "CANCEL"
      ? await accessToken({ context: input.current, requestUrl: input.requestUrl })
      : "";
    providerWriteAttempted = input.current.preview.action === "CANCEL";
    const provider = await cancelGoogleCalendarProjection({
      preview: input.current.preview,
      accessToken: token,
      calendarId: input.current.collection.providerCalendarId,
    });
    providerExternalMutated = provider.externalMutated;
    let after: GoogleCalendarProjectionContext;
    try {
      after = await input.reload();
    } catch (reloadError) {
      if (!providerWriteAttempted) throw reloadError;
      let conflict: { projection: { id: string }; receipt: { id: string } };
      try {
        conflict = await persistPostProviderVerificationConflict({
          prisma: input.prisma,
          before: input.current,
          actorUserId: input.actorUserId,
          operation: "CANCEL_EVENT",
          projectionSchema: input.projectionSchema,
          receiptSchema: input.receiptSchema,
          provider,
        });
      } catch (receiptError) {
        console.error("[calendar-projection] Could not persist the post-provider cancellation receipt.", receiptError);
        throw new GoogleCalendarProjectionOperationError(
          "Google cancellation was observed, but Quipsly could not save its verification receipt. Retry this exact cancellation after storage recovers.",
          "post-provider-receipt-failed",
          503,
          true,
          provider.externalMutated,
        );
      }
      throw new GoogleCalendarProjectionOperationError(
        "Google cancellation was observed, but Quipsly source authority or truth changed before the result could be verified. Review the recorded conflict.",
        "post-provider-verification-failed",
        409,
        true,
        provider.externalMutated,
        undefined,
        conflict.projection.id,
        conflict.receipt.id,
      );
    }
    if (after.preview.sourceRevision !== input.current.preview.sourceRevision) {
      const conflict = await persistSourceChangedConflict({
        prisma: input.prisma,
        before: input.current,
        after,
        actorUserId: input.actorUserId,
        operation: "CANCEL_EVENT",
        projectionSchema: input.projectionSchema,
        receiptSchema: input.receiptSchema,
        provider,
      });
      throw new GoogleCalendarProjectionOperationError(
        "Google cancellation was observed, but Quipsly changed during the operation. Review the recorded conflict before projecting again.",
        "source-changed-after-provider-effect",
        409,
        providerWriteAttempted,
        provider.externalMutated,
        undefined,
        conflict.projection.id,
        conflict.receipt.id,
      );
    }
    const occurredAt = new Date();
    const persisted = await input.prisma.$transaction(async (transaction: any) => {
      const projection = await transaction.calendarProjection.upsert({
        where: projectionIdentity(input.current),
        create: {
          collectionId: input.current.collection.id,
          sourceType: input.current.preview.snapshot.sourceType,
          sourceId: input.current.source.id,
          sourceRevision: input.current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: null,
          uid: input.current.preview.uid,
          status: "CANCELED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: projectionMetadata({ schema: input.projectionSchema, cancellationConfirmed: true, providerAlreadyAbsent: provider.providerAlreadyAbsent }),
        },
        update: {
          sourceRevision: input.current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: null,
          sequence: { increment: provider.externalMutated ? 1 : 0 },
          status: "CANCELED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: projectionMetadata({ schema: input.projectionSchema, cancellationConfirmed: true, providerAlreadyAbsent: provider.providerAlreadyAbsent }),
        },
      });
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: input.current.collection.connectionId,
          collectionId: input.current.collection.id,
          projectionId: projection.id,
          actorUserId: input.actorUserId,
          operation: "CANCEL_EVENT",
          outcome: provider.externalMutated ? "SUCCEEDED" : "SKIPPED",
          requestDigest: input.current.preview.sourceRevision,
          responseDigest: provider.providerEventId || provider.providerStatus,
          providerStatus: provider.providerStatus,
          externalMutated: provider.externalMutated,
          occurredAt,
          metadataJson: projectionMetadata({ schema: input.receiptSchema, cancellationConfirmed: true, providerAlreadyAbsent: provider.providerAlreadyAbsent }),
        },
      });
      return { projection, receipt };
    });
    return {
      projectionId: persisted.projection.id,
      receiptId: persisted.receipt.id,
      sourceRevision: input.current.preview.sourceRevision,
      action: "CANCEL" as const,
      externalMutated: provider.externalMutated,
      providerAlreadyAbsent: provider.providerAlreadyAbsent,
    };
  } catch (error) {
    if (error instanceof GoogleCalendarProjectionOperationError) throw error;
    if (
      error instanceof SessionCalendarProjectionError
      && error.code === "provider-etag-conflict"
    ) {
      await persistProviderConflict({
        prisma: input.prisma,
        context: input.current,
        actorUserId: input.actorUserId,
        operation: "CANCEL_EVENT",
        receiptSchema: input.receiptSchema,
        providerStatus: "etag-conflict",
      }).catch((receiptError) => {
        console.error("[calendar-projection] Could not persist provider cancellation conflict.", receiptError);
      });
    }
    const known = error instanceof SessionCalendarProjectionError;
    throw new GoogleCalendarProjectionOperationError(
      known ? error.message : "The Google Calendar event could not be removed safely.",
      known ? error.code : "provider-cancel-failed",
      known ? error.status : 503,
      providerWriteAttempted,
      providerExternalMutated === true
        ? true
        : providerWriteAttempted && providerExternalMutated === null
          ? "unknown"
          : false,
      providerWriteAttempted && providerExternalMutated === null
        ? "Retry the same cancellation preview. If Google already removed the event, Quipsly will record that exact absence without another effect."
        : undefined,
    );
  }
}
