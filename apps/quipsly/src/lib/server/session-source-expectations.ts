import "server-only";

import { createHash } from "node:crypto";

import type {
  CallExpectedSourceAction,
  CallExpectedSourceKind,
  CallExpectedSourceRole,
} from "@prisma/client";

export const EXPECTED_SOURCE_KINDS = ["AUDIO", "VIDEO", "SCREEN", "PROVIDER", "OTHER"] as const;
export const EXPECTED_SOURCE_ROLES = ["REQUIRED_MASTER", "OPTIONAL_MASTER", "SYNC_WITNESS", "BACKUP"] as const;
export const EXPECTED_SOURCE_ACTIONS = ["BIND", "UNBIND", "WAIVE", "RESTORE", "CANCEL"] as const;

type ExpectedSourceKind = typeof EXPECTED_SOURCE_KINDS[number];
type ExpectedSourceRole = typeof EXPECTED_SOURCE_ROLES[number];
type ExpectedSourceAction = typeof EXPECTED_SOURCE_ACTIONS[number];

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  const normalized = text(value, 80).toUpperCase();
  return values.includes(normalized as T[number]) ? normalized as T[number] : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
}

export function expectedSourceRequestSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export type CreateExpectedSourceInput = {
  requestId: string;
  participantId: string | null;
  label: string;
  sourceKind: ExpectedSourceKind;
  retentionRole: ExpectedSourceRole;
  expectedClientKind: string | null;
  expectedDeviceLabel: string | null;
  reason: string | null;
};

export type MutateExpectedSourceInput = {
  requestId: string;
  expectationId: string;
  expectedRevision: number;
  action: ExpectedSourceAction;
  recordingAssetId: string | null;
  reason: string | null;
};

export function parseCreateExpectedSource(value: unknown): CreateExpectedSourceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const requestId = text(body.requestId, 64).toLowerCase();
  const participantId = text(body.participantId, 128) || null;
  const label = text(body.label, 160);
  const sourceKind = enumValue(body.sourceKind, EXPECTED_SOURCE_KINDS);
  const retentionRole = enumValue(body.retentionRole, EXPECTED_SOURCE_ROLES);
  const expectedClientKind = text(body.expectedClientKind, 40).toLowerCase() || null;
  const expectedDeviceLabel = text(body.expectedDeviceLabel, 160) || null;
  const reason = text(body.reason, 500) || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)
      || !label
      || !sourceKind
      || !retentionRole
      || (sourceKind === "PROVIDER" && retentionRole === "REQUIRED_MASTER")
      || (expectedClientKind && !["ios", "web", "macos", "external"].includes(expectedClientKind))) return null;
  return { requestId, participantId, label, sourceKind, retentionRole, expectedClientKind, expectedDeviceLabel, reason };
}

export function parseMutateExpectedSource(value: unknown): MutateExpectedSourceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const requestId = text(body.requestId, 64).toLowerCase();
  const expectationId = text(body.expectationId, 128);
  const expectedRevision = Number(body.expectedRevision);
  const action = enumValue(body.action, EXPECTED_SOURCE_ACTIONS);
  const recordingAssetId = text(body.recordingAssetId, 128) || null;
  const reason = text(body.reason, 500) || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)
      || !expectationId
      || !Number.isSafeInteger(expectedRevision)
      || expectedRevision < 1
      || !action
      || (action === "BIND" && !recordingAssetId)
      || (["WAIVE", "CANCEL"].includes(action) && !reason)) return null;
  return { requestId, expectationId, expectedRevision, action, recordingAssetId, reason };
}

export function recordingKindMatchesExpectation(
  expectationKind: CallExpectedSourceKind | string,
  recordingKind: string,
) {
  const expected = String(expectationKind).toUpperCase();
  const actual = recordingKind.toUpperCase();
  if (expected === "AUDIO") return actual === "LOCAL_AUDIO";
  if (expected === "VIDEO") return actual === "LOCAL_VIDEO";
  if (expected === "SCREEN") return actual === "SCREEN_REFERENCE";
  if (expected === "PROVIDER") return actual === "SERVER_MIX";
  return !["LOCAL_AUDIO", "LOCAL_VIDEO", "SCREEN_REFERENCE", "SERVER_MIX"].includes(actual);
}

export function expectedSourceSnapshot(expectation: {
  id: string;
  roomId: string;
  participantId: string | null;
  label: string;
  sourceKind: CallExpectedSourceKind | string;
  retentionRole: CallExpectedSourceRole | string;
  status: string;
  expectedClientKind: string | null;
  expectedDeviceLabel: string | null;
  recordingAssetId: string | null;
  captureId: string | null;
  revision: number;
  latestReason: string | null;
}) {
  return {
    id: expectation.id,
    roomId: expectation.roomId,
    participantId: expectation.participantId,
    label: expectation.label,
    sourceKind: String(expectation.sourceKind),
    retentionRole: String(expectation.retentionRole),
    status: expectation.status,
    expectedClientKind: expectation.expectedClientKind,
    expectedDeviceLabel: expectation.expectedDeviceLabel,
    recordingAssetId: expectation.recordingAssetId,
    captureId: expectation.captureId,
    revision: expectation.revision,
    latestReason: expectation.latestReason,
  };
}

export function mutationStatus(action: ExpectedSourceAction) {
  if (action === "WAIVE") return "WAIVED" as const;
  if (action === "CANCEL") return "CANCELED" as const;
  return "ACTIVE" as const;
}

export function expectedSourceTransitionAllowed(action: ExpectedSourceAction, current: {
  status: string;
  retentionRole: string;
  recordingAssetId: string | null;
}) {
  const status = current.status.toUpperCase();
  const role = current.retentionRole.toUpperCase();
  if (action === "BIND") return status === "ACTIVE" && !current.recordingAssetId;
  if (action === "UNBIND") return status === "ACTIVE" && Boolean(current.recordingAssetId);
  if (action === "WAIVE") return status === "ACTIVE" && role === "REQUIRED_MASTER";
  if (action === "CANCEL") return status === "ACTIVE";
  return status === "WAIVED" || status === "CANCELED";
}

export function prismaExpectedSourceAction(action: ExpectedSourceAction): CallExpectedSourceAction {
  return action;
}
